"""單一站點的執行流程（docs/scraper.md §3）：

adapter 列出內文 → 抽取 → 狀態比對 → 標題規則 → 附件 → 品質關卡 → 健康檢查 → 推送 / 下架。

健康檢查不通過時（被擋、數量驟降、品質通過率太低），這次的結果不推送、也不判定下架，
待推送的項目維持未處理狀態，下次執行會重新處理。
"""

import json
import logging
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Protocol

from scraper.adapters import Adapter, RawItem
from scraper.extract import Extracted, extract_html
from scraper.extract.files import MAX_ATTACHMENT_CHARS, parse_file
from scraper.fetch import Fetcher, FetchError
from scraper.filter.rules import judge_title
from scraper.models import Attachment, Classification, IngestItem, Source
from scraper.normalize import content_hash, program_key
from scraper.quality import MIN_CONTENT_CHARS, Candidate, quality_issues
from scraper.sites import SiteConfig
from scraper.state import Change, State

log = logging.getLogger(__name__)

MAX_ATTACHMENTS = 10
DEGRADED_RATIO = 0.5  # 看到的數量少於上次正常執行的一半
MIN_PASS_RATE = 0.7  # 品質關卡通過率
# 開放資料裡不需要放進正文的欄位（代碼類）
_OPENDATA_SKIP = ("縣市別代碼", "機關代碼", "流水號", "編號")


class Sink(Protocol):
    def ingest(self, item: IngestItem) -> None: ...
    def remove(self, site_id: str, urls: list[str]) -> None: ...


class JsonlSink:
    """dry-run：把要推送的內容寫成 JSONL，方便人工檢查。"""

    def __init__(self, directory: Path) -> None:
        directory.mkdir(parents=True, exist_ok=True)
        self.directory = directory

    def ingest(self, item: IngestItem) -> None:
        with (self.directory / f"{item.source.site_id}.jsonl").open("a", encoding="utf-8") as f:
            f.write(json.dumps(item.to_payload(), ensure_ascii=False) + "\n")

    def remove(self, site_id: str, urls: list[str]) -> None:
        if urls:
            with (self.directory / f"{site_id}.removed.txt").open("a", encoding="utf-8") as f:
                f.write("\n".join(urls) + "\n")


@dataclass
class SiteResult:
    site_id: str
    seen: int = 0
    new: int = 0
    updated: int = 0
    unchanged: int = 0
    removed: int = 0
    filtered: int = 0
    quarantined: int = 0
    pushed: int = 0
    push_failed: int = 0
    pages: int = 0
    health: str = "ok"
    health_detail: str = ""
    errors: list[str] = field(default_factory=list)
    quarantine: list[dict[str, object]] = field(default_factory=list)


@dataclass(frozen=True)
class Ready:
    url: str
    hash: str
    item: IngestItem


def extract_item(raw: RawItem, adapter: Adapter) -> Extracted:
    if raw.fields is not None:
        lines = [f"- **{k}**：{v}" for k, v in raw.fields.items() if v and not any(s in k for s in _OPENDATA_SKIP)]
        return Extracted(title=raw.title_hint or "", content_md="\n".join(lines), published_at=None)
    return extract_html(
        raw.html or "", raw.url, hint=raw.title_hint, body=adapter.body_selector, content=adapter.content_selector
    )


class SiteRun:
    def __init__(
        self,
        site: SiteConfig,
        adapter: Adapter,
        fetcher: Fetcher,
        state: State,
        *,
        run_id: str,
        today: date,
        limit: int | None = None,
    ) -> None:
        self.site = site
        self.adapter = adapter
        self.fetcher = fetcher
        self.state = state
        self.run_id = run_id
        self.today = today
        self.limit = limit
        self.result = SiteResult(site.id)
        self._attachment_cache: dict[str, str] = {}
        self._hashes: dict[str, str] = {}  # content_hash → 第一個出現的網址（找重複內容）

    def attachments(self, ext: Extracted) -> list[Attachment]:
        out: list[Attachment] = []
        budget = MAX_ATTACHMENT_CHARS
        for link in ext.attachments[:MAX_ATTACHMENTS]:
            if link.url not in self._attachment_cache:
                try:
                    # 附件只重試一次：附件抓不到不影響正文，不值得等太久
                    res = self.fetcher.get(link.url, retries=1)
                    text = parse_file(res.content).text if res.status < 400 else ""
                except FetchError as e:
                    self.result.errors.append(f"attachment {e.reason} {link.url}")
                    text = ""
                self._attachment_cache[link.url] = text
            text = self._attachment_cache[link.url][:budget]
            budget -= len(text)
            try:
                out.append(Attachment(name=link.name[:200], url=link.url, text=text))  # type: ignore[arg-type]
            except ValueError:
                continue  # 網址不合法（例如含空白），略過這個附件
        return out

    def process(self, raw: RawItem) -> Ready | None:
        r = self.result
        ext = extract_item(raw, self.adapter)
        h = content_hash(ext.content_md, [a.url for a in ext.attachments])
        change = self.state.observe(raw.url, self.site.id, ext.title, h, self.run_id)
        if change is Change.UNCHANGED:
            r.unchanged += 1
            return None
        if change is Change.NEW:
            r.new += 1
        else:
            r.updated += 1

        verdict = judge_title(ext.title, tuple(self.site.exclude_title))
        if verdict == "exclude":
            r.filtered += 1
            self.state.settle(raw.url, "filtered", h, "title_rule")
            return None

        attachments = self.attachments(ext)
        attachment_text = "\n\n".join(a.text for a in attachments if a.text)
        content = ext.content_md
        if len(content) < MIN_CONTENT_CHARS and attachment_text:
            # 很多公告的內容只放在附件裡：正文太短時把附件文字併入
            sections = [f"## 附件：{a.name}\n\n{a.text}" for a in attachments if a.text]
            content = "\n\n".join([content, *sections]).strip()

        issues = quality_issues(Candidate(ext.title, content, ext.published_at), self.today)
        if not issues and (first := self._hashes.get(h)) and first != raw.url:
            issues = ["duplicate_content"]
        self._hashes.setdefault(h, raw.url)
        if issues:
            r.quarantined += 1
            r.quarantine.append({"url": raw.url, "title": ext.title, "issues": issues})
            self.state.settle(raw.url, "quarantined", h, ",".join(issues))
            return None

        item = IngestItem(
            source=Source(site_id=self.site.id, city=self.site.city, url=raw.link or raw.url, kind=self.site.kind),  # type: ignore[arg-type]
            program_key=program_key(self.site.id, ext.title),
            title=ext.title,
            published_at=ext.published_at,
            content_md=content,
            attachments=attachments,
            structured=raw.fields or {},
            # P0 還沒有 LLM 分類（P1 加入）：先以標題規則給一個保守的信心值
            classification=Classification(type="program", confidence=0.7 if verdict == "boost" else 0.5),
            content_hash=h,
        )
        return Ready(raw.url, h, item)

    def health(self) -> tuple[str, str]:
        r = self.result
        if r.seen == 0:
            first_error = r.errors[0] if r.errors else "no items"
            return "blocked", first_error
        previous = self.state.last_ok_seen(self.site.id)
        if previous and r.seen < previous * DEGRADED_RATIO:
            return "degraded", f"seen {r.seen} < 50% of {previous}"
        judged = r.pushed + len(self._ready) + r.quarantined
        if judged >= 10 and r.quarantined / judged > 1 - MIN_PASS_RATE:
            return "degraded", f"quality pass rate {1 - r.quarantined / judged:.0%}"
        return "ok", ""

    def run(self, sink: Sink) -> SiteResult:
        r = self.result
        self._ready: list[Ready] = []
        for raw in self.adapter.list_items():
            r.seen += 1
            try:
                ready = self.process(raw)
            except Exception as e:  # 單一頁面的錯誤不影響整站
                log.exception("process %s", raw.url)
                r.errors.append(f"process {type(e).__name__} {raw.url}")
                continue
            if ready:
                self._ready.append(ready)
            if self.limit and r.seen >= self.limit:
                break
        r.pages = self.adapter.stats.pages
        r.errors = self.adapter.stats.errors + r.errors
        r.health, r.health_detail = self.health()

        if r.health == "ok":
            for ready in self._ready:
                try:
                    sink.ingest(ready.item)
                except Exception as e:
                    r.push_failed += 1
                    r.errors.append(f"push {e}")
                    continue
                self.state.settle(ready.url, "active", ready.hash)
                self.state.mark_pushed(ready.url, ready.hash)
                r.pushed += 1
            if not self.limit:  # 只跑部分內容時無法判斷下架
                removed = self.state.sweep(self.site.id, self.run_id)
                r.removed = len(removed)
                try:
                    sink.remove(self.site.id, removed)
                except Exception as e:
                    r.errors.append(f"remove {e}")
        # 只跑部分內容的執行不能當作之後健康檢查的基準
        self.state.record_run(self.run_id, self.site.id, r.seen, "partial" if self.limit else r.health)
        return r
