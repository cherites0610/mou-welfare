"""HTML 內文頁 → 標題、正文 Markdown、發布日期、附件連結。"""

import re
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urljoin

import trafilatura
from selectolax.lexbor import LexborHTMLParser, LexborNode

from scraper.extract.dates import find_published_date

MIN_BODY_CHARS = 80

# 每次瀏覽都會變的欄位：留著會讓 content_hash 每天不同，被誤判成「更新」
_VOLATILE_LINE = re.compile(r"(點閱|瀏覽|人次|最後更新|更新日期|更新時間|友善列印|回上一頁|:::)")
# 無障礙用的定位文字，不是正文
_ACCESSKEY_LINE = re.compile(r"^(?:#+\s*)?(?:中央內容區塊|跳到主要內容區塊?|主要內容區)$")
_NEW_WINDOW = re.compile(r"\s*[(（\[［](?:另開|開啟)新視窗[)）\]］]")
_FILE_LINK = re.compile(
    r"(?i)(\.(pdf|odt|ods|odp|docx?|xlsx?|pptx?)(?:$|[?#&])|download\.ashx|downdoc|/attachment/|/download/)"
)
_FILE_EXT = r"(?:pdf|odt|ods|odp|docx?|xlsx?|pptx?)"
_FILE_NAME_NOISE = [
    re.compile(rf"^{_FILE_EXT}\s+", re.I),  # A 族：「docx 開立專戶申請書(14.29 KB).docx[另開新視窗]」
    re.compile(r"[\[［(（]另開新視窗[\]］)）]"),
    re.compile(r"[(（]\s*[\d.]+\s*[KMG]?B\s*[)）]", re.I),
    re.compile(rf"[（(](?:{_FILE_EXT}|檔案下載|、)+[)）]\s*$", re.I),  # 基隆：「(PDF、檔案下載)」
]
_TITLE_SEP = re.compile(r"\s*[-－|｜_]\s*")
_SITE_WORDS = re.compile(r"(政府|社會處|社會局|全球資訊網|首頁)")


@dataclass(frozen=True)
class AttachmentLink:
    name: str
    url: str


@dataclass(frozen=True)
class Extracted:
    title: str
    content_md: str
    published_at: date | None
    attachments: list[AttachmentLink] = field(default_factory=list)


def clean_text(text: str) -> str:
    text = re.sub(r"[ \t　\xa0]+", " ", text)
    return text.strip()


def dedupe_halves(text: str) -> str:
    """A 族網站的連結文字常是「標題 標題」（畫面文字 + 給報讀軟體的隱藏文字）；也去掉「(開啟新視窗)」。"""
    text = clean_text(_NEW_WINDOW.sub("", text))
    half, rest = divmod(len(text), 2)
    if rest == 1 and text[half] == " " and text[:half] == text[half + 1 :]:
        return text[:half]
    return text


def clean_page_title(raw: str) -> str:
    """「基隆市政府社會處－經濟扶助－中低收入老人生活津貼申請」→「中低收入老人生活津貼申請」。"""
    parts = [p for p in _TITLE_SEP.split(clean_text(raw)) if p]
    kept = [p for p in parts if not _SITE_WORDS.search(p)]
    return kept[-1] if kept else clean_text(raw)


def _meta(doc: LexborHTMLParser, prop: str) -> str | None:
    node = doc.css_first(f'meta[property="{prop}"]')
    value = node.attributes.get("content") if node else None
    return clean_text(value) if value else None


def pick_title(doc: LexborHTMLParser, hint: str | None) -> str:
    """列表上的連結文字最準（A 族的 og:title 只有分類名稱），其次是 og:title、<title>。"""
    if hint and len(dedupe_halves(hint)) >= 4:
        return dedupe_halves(hint)
    og = _meta(doc, "og:title")
    title_node = doc.css_first("title")
    page_title = clean_page_title(title_node.text()) if title_node else ""
    # og:title 比 <title> 短很多時，通常只是分類名稱
    if og and len(og) >= 4 and not (page_title and og in page_title and len(og) < len(page_title) // 2):
        return clean_page_title(og)
    return page_title or og or ""


def clean_markdown(md: str) -> str:
    lines = [re.sub(r"[ \t\u3000\xa0]+", " ", ln).strip() for ln in md.splitlines()]
    lines = [ln for ln in lines if not _VOLATILE_LINE.search(ln) and not _ACCESSKEY_LINE.match(ln)]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _body_nodes(doc: LexborHTMLParser, body: str | None) -> list[LexborNode]:
    if body:
        return doc.css(body)
    return doc.css("main, article")


def find_attachments(doc: LexborHTMLParser, base_url: str, body: str | None) -> list[AttachmentLink]:
    found: dict[str, AttachmentLink] = {}
    for node in _body_nodes(doc, body):
        for a in node.css("a[href]"):
            href = (a.attributes.get("href") or "").strip()
            if not href or href.startswith(("javascript:", "#", "mailto:")) or not _FILE_LINK.search(href):
                continue
            url = urljoin(base_url, href)
            name = clean_text(a.attributes.get("title") or "") or clean_text(a.text())
            for noise in _FILE_NAME_NOISE:
                name = noise.sub("", name).strip()
            found.setdefault(url, AttachmentLink(name=name or url.rsplit("/", 1)[-1], url=url))
    return list(found.values())


def navigation_ratio(doc: LexborHTMLParser, md: str) -> float:
    """輸出裡有多少行剛好是頁面上某個連結的文字。比例高代表抓到的是選單，不是正文。"""
    link_texts = {clean_text(a.text()) for a in doc.css("a")}
    link_texts.discard("")
    lines = [clean_text(ln.lstrip("-*#|> ")) for ln in md.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines:
        return 0.0
    return sum(ln in link_texts for ln in lines) / len(lines)


MAX_NAVIGATION_RATIO = 0.5


def extract_html(
    html: str, url: str, *, hint: str | None = None, body: str | None = None, content: str | None = None
) -> Extracted:
    """`body`：找附件的區塊；`content`：正文區塊，trafilatura 失敗時的備援（沒有就用 body）。"""
    doc = LexborHTMLParser(html)
    md = trafilatura.extract(
        html, url=url, output_format="markdown", include_tables=True, include_links=False, include_images=False
    )
    text = clean_markdown(md or "")
    # 正文區塊是空的時，trafilatura 會退回整頁文字（選單、頁尾），這種結果不能用
    if navigation_ratio(doc, text) > MAX_NAVIGATION_RATIO:
        text = ""
    if len(text) < MIN_BODY_CHARS:
        fallback = "\n\n".join(n.text(separator="\n", strip=True) for n in _body_nodes(doc, content or body))
        fallback = clean_markdown(fallback)
        if len(fallback) > len(text) and navigation_ratio(doc, fallback) <= MAX_NAVIGATION_RATIO:
            text = fallback
    page_text = (doc.body.text(separator="\n") if doc.body else "") or text
    return Extracted(
        title=pick_title(doc, hint),
        content_md=text,
        published_at=find_published_date(text) or find_published_date(page_text),
        attachments=find_attachments(doc, url, body),
    )
