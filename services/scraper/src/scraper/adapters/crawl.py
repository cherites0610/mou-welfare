"""從起點列表往下走、收集內文頁的通用 adapter（A、B 族與多數 C 族共用）。

- 只在 `region` 區塊裡找連結，不碰選單和頁尾，避免走到「最新消息」「採購」等區塊。
- `follow` 比對到的是列表頁（深度受 `max_depth` 限制），`detail` 比對到的是內文頁。
- 列表頁裡已經沒有任何列表或內文連結、本身又有內容時，當成內文頁（只有一筆資料的列表）。
- 只走同一個主機。
"""

import re
from collections import deque
from collections.abc import Iterator
from typing import ClassVar
from urllib.parse import parse_qsl, urlencode, urljoin, urlsplit, urlunsplit

from selectolax.lexbor import LexborHTMLParser

from scraper.adapters.base import Adapter, RawItem
from scraper.extract.html import dedupe_halves
from scraper.fetch import FetchError

Link = tuple[str, str]  # (網址, 連結文字)


class LinkCrawler(Adapter):
    DEFAULTS: ClassVar[dict[str, str]] = {}

    def _setting(self, key: str) -> str | None:
        value = getattr(self.site, key)
        return value if value is not None else self.DEFAULTS.get(key)

    @property
    def body_selector(self) -> str | None:
        return self._setting("body")

    @property
    def content_selector(self) -> str | None:
        return self._setting("content")

    def __init__(self, *args: object, **kwargs: object) -> None:
        super().__init__(*args, **kwargs)  # type: ignore[arg-type]
        follow, detail = self._setting("follow"), self._setting("detail")
        if not detail:
            raise ValueError(f"{self.site.id}: 缺少 detail 規則")
        self.follow = re.compile(follow) if follow else None
        self.detail = re.compile(detail)
        self.region = self._setting("region")
        self.exclude = [re.compile(p) for p in self.site.exclude_urls]
        base = urlsplit(self.site.base_url)
        self.scheme, self.host = base.scheme, base.netloc

    # ---- 網址 ----

    def canonical(self, href: str, base: str) -> str | None:
        href = href.strip()
        if not href or href.startswith(("javascript:", "mailto:", "tel:", "#")):
            return None
        parts = urlsplit(urljoin(base, href))
        if parts.scheme not in ("http", "https"):
            return None
        if parts.netloc == self.host:
            scheme = self.scheme  # 同一站常混用 http 與 https，統一成 base_url 的
        elif parts.netloc in self.site.extra_hosts:
            scheme = parts.scheme
        else:
            return None
        query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k not in self.site.drop_params]
        return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), ""))

    def links(self, doc: LexborHTMLParser, page_url: str) -> list[Link]:
        nodes = doc.css(self.region) if self.region else [doc.body] if doc.body else []
        found: dict[str, str] = {}
        for node in nodes:
            for a in node.css("a[href]"):
                url = self.canonical(a.attributes.get("href") or "", page_url)
                if url and url not in found and not any(p.search(url) for p in self.exclude):
                    found[url] = dedupe_halves(a.attributes.get("title") or a.text())
        return list(found.items())

    def is_detail(self, url: str) -> bool:
        return bool(self.detail.search(url))

    def is_list(self, url: str) -> bool:
        # 只在本站往下走列表；其他主機只收內文頁
        same_host = urlsplit(url).netloc == self.host
        return same_host and bool(self.follow and self.follow.search(url)) and not self.is_detail(url)

    def is_hub(self, url: str, details: list[Link]) -> bool:
        """內文網址但其實是目錄（例如 A 族的 cp.aspx?n=X 會顯示第一筆，同時列出 &s= 子項目）。"""
        return False

    def page_url(self, url: str, page: int) -> str:
        assert self.site.pagination is not None
        parts = urlsplit(url)
        query = [(k, v) for k, v in parse_qsl(parts.query) if k != self.site.pagination.param]
        query += [(self.site.pagination.param, str(page)), *self.site.pagination.extra.items()]
        return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), ""))

    # ---- 抓取 ----

    def fetch_doc(self, url: str) -> tuple[str, LexborHTMLParser] | None:
        try:
            res = self.fetcher.get(url)
        except FetchError as e:
            self.stats.errors.append(f"{e.reason} {url}")
            return None
        self.stats.pages += 1
        if res.status >= 400:
            self.stats.errors.append(f"http_{res.status} {url}")
            return None
        if "html" not in res.content_type:
            return None
        return res.text, LexborHTMLParser(res.text)

    def list_items(self) -> Iterator[RawItem]:
        queue: deque[tuple[str, int, str | None]] = deque()
        for seed in self.site.seeds:
            url = self.canonical(seed.url, self.site.base_url)
            if url:
                queue.append((url, 0, None))
        visited: set[str] = set()
        while queue:
            url, depth, hint = queue.popleft()
            if url in visited:
                continue
            visited.add(url)
            fetched = self.fetch_doc(url)
            if fetched is None:
                continue
            html, doc = fetched
            links = self.links(doc, url)
            details = [link for link in links if self.is_detail(link[0])]
            lists = [link for link in links if self.is_list(link[0])]

            if self.is_detail(url):
                if not self.is_hub(url, details):
                    yield RawItem(url=url, title_hint=hint, html=html)
                # 內文頁旁邊常列出同一分類的其他項目，一起收進來；但不從內文頁往其他列表走
                queue.extend((u, depth, t) for u, t in details if u not in visited)
                continue

            if not details and not lists:
                yield RawItem(url=url, title_hint=hint, html=html)  # 只有一筆資料的列表
                continue

            queue.extend((u, depth + 1, t) for u, t in details if u not in visited)
            if depth < self.site.max_depth:
                queue.extend((u, depth + 1, t) for u, t in lists if u not in visited)
            if self.site.pagination and details:
                queue.extend((u, depth + 1, t) for u, t in self.paginate(url, {u for u, _ in details}, visited))

    def paginate(self, url: str, known: set[str], visited: set[str]) -> Iterator[Link]:
        """第 2 頁起依序往後抓，直到某一頁沒有新的內文連結。

        有額外參數（例如每頁筆數）時從第 1 頁重新抓：原本的第 1 頁用的是網站預設的每頁筆數，
        第 2 頁改用新的筆數會跳過中間的項目。
        """
        assert self.site.pagination is not None
        first = 1 if self.site.pagination.extra else 2
        for page in range(first, self.site.pagination.max + 1):
            page_url = self.page_url(url, page)
            if page_url in visited:
                return
            visited.add(page_url)
            fetched = self.fetch_doc(page_url)
            if fetched is None:
                return
            new = [(u, t) for u, t in self.links(fetched[1], page_url) if self.is_detail(u) and u not in known]
            if not new:
                return
            known.update(u for u, _ in new)
            yield from new


class CmsA(LinkCrawler):
    """A 族（臺北、桃園、臺南、金門等 11 縣市共用的 CMS）：Content_List / cp / News_Content。"""

    DEFAULTS: ClassVar[dict[str, str]] = {
        "follow": r"Content_List\.aspx\?n=[0-9A-F]{16}$",
        "detail": r"(cp|News_Content)\.aspx\?n=[0-9A-F]{16}(&s=[0-9A-F]{16})?$",
        "region": "div.page-content",
        "body": "div.page-content, div.area-editor, div.file-download-multiple",
        # 正文：日期資訊 + 編輯區；不含 page-content 裡同分類的項目清單
        "content": "div.list-text.detail, div.area-editor.user-edit, div.area-editor.system-info",
    }

    def is_hub(self, url: str, details: list[Link]) -> bool:
        return "&s=" not in url and any(u.startswith(url + "&s=") for u, _ in details)


class CmsB(LinkCrawler):
    """B 族（新北、新竹市、澎湖）：home.jsp?id=分類，內文是 act=...&dataserno=...，列表用 page 參數分頁。"""

    DEFAULTS: ClassVar[dict[str, str]] = {
        "follow": r"home\.jsp\?id=[0-9a-f]{16}$",
        "detail": r"home\.jsp\?id=[0-9a-f]{16}&act=[0-9a-f]{16}&dataserno=[0-9a-f]{32}$",
        "region": "div#home_content",
        "body": "div#home_content",
    }
