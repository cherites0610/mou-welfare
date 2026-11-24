from collections.abc import Iterator
from datetime import date

import jsonschema
from conftest import MockWeb, fixture, html
from test_contract import SCHEMA_PATH

from scraper.adapters import Adapter, RawItem
from scraper.fetch import Fetcher
from scraper.models import IngestItem
from scraper.pipeline import SiteRun
from scraper.sites import SiteConfig
from scraper.state import State

TODAY = date(2026, 11, 19)
BODY = "申請資格：年滿65歲並設籍本縣，最近一年居住國內超過183日。" * 4


def page(title: str, body: str = BODY, extra: str = "") -> str:
    head = f"<head><title>{title}</title></head>"
    return f"<html>{head}<body><main><h1>{title}</h1><p>{body}</p>{extra}</main></body></html>"


class FakeAdapter(Adapter):
    def __init__(self, site: SiteConfig, fetcher: Fetcher, items: list[RawItem]) -> None:
        super().__init__(site, fetcher)
        self.items = items

    def list_items(self) -> Iterator[RawItem]:
        yield from self.items


class Sink:
    def __init__(self, fail: bool = False) -> None:
        self.items: list[IngestItem] = []
        self.removed: list[str] = []
        self.fail = fail

    def ingest(self, item: IngestItem) -> None:
        if self.fail:
            raise RuntimeError("api down")
        self.items.append(item)

    def remove(self, site_id: str, urls: list[str]) -> None:
        self.removed += urls


SITE = SiteConfig.model_validate(
    {
        "id": "kinmen",
        "city": "金門縣",
        "adapter": "cms_a",
        "base_url": "https://s.example",
        "seeds": [{"url": "/", "label": "x"}],
    }
)


def run(items: list[RawItem], state: State, run_id: str, *, web: MockWeb | None = None, sink: Sink | None = None):  # type: ignore[no-untyped-def]
    sink = sink or Sink()
    with (web or MockWeb()).fetcher() as f:
        result = SiteRun(SITE, FakeAdapter(SITE, f, items), f, state, run_id=run_id, today=TODAY).run(sink)
    return result, sink


def items(n: int) -> list[RawItem]:
    return [RawItem(url=f"https://s.example/{i}", html=page(f"第{i}號福利生活津貼")) for i in range(n)]


def test_推送內容符合共用schema() -> None:
    import json

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    r, sink = run(items(3), State(":memory:"), "r1")
    assert (r.seen, r.new, r.pushed, r.health) == (3, 3, 3, "ok")
    for item in sink.items:
        jsonschema.validate(item.to_payload(), schema, format_checker=jsonschema.FormatChecker())
    assert sink.items[0].source.kind == "cms"
    assert sink.items[0].classification.confidence == 0.7  # 標題含「津貼」


def test_第二次執行_沒變的不再推送_變了的推送() -> None:
    state = State(":memory:")
    run(items(3), state, "r1")
    changed = items(3)
    changed[1] = RawItem(url=changed[1].url, html=page("第1號福利生活津貼", BODY + "（新增說明）"))
    r, sink = run(changed, state, "r2")
    assert (r.unchanged, r.updated, r.pushed) == (2, 1, 1)
    assert "新增說明" in sink.items[0].content_md


def test_標題規則排除_品質不合格隔離() -> None:
    raw = [
        RawItem(url="https://s.example/minutes", html=page("115年第3次老人福利促進委員會會議紀錄")),
        RawItem(url="https://s.example/short", html=page("老人假牙補助", "請參閱附件")),
        RawItem(url="https://s.example/ok", html=page("老人假牙補助申請")),
        RawItem(url="https://s.example/dup", html=page("老人假牙補助申請")),  # 同樣內容、不同網址
    ]
    r, sink = run(raw, State(":memory:"), "r1")
    assert (r.filtered, r.quarantined, r.pushed) == (1, 2, 1)
    issues = {q["url"]: q["issues"] for q in r.quarantine}
    assert issues["https://s.example/short"] == ["content_too_short"]
    assert issues["https://s.example/dup"] == ["duplicate_content"]


def test_內容只在附件時併入正文() -> None:
    import io

    import docx

    d = docx.Document()
    d.add_paragraph("補助對象：設籍本縣之身心障礙者，每月補助新臺幣5,000元，檢附身分證、身心障礙證明向公所申請。" * 2)
    buf = io.BytesIO()
    d.save(buf)
    web = MockWeb({"https://s.example/f.docx": (200, buf.getvalue(), "application/octet-stream")})
    link = '<a href="/f.docx">申請表</a>'
    raw = [RawItem(url="https://s.example/a", html=page("身心障礙者生活補助", "詳見附件", link))]
    r, sink = run(raw, State(":memory:"), "r1", web=web)
    assert r.pushed == 1
    item = sink.items[0]
    assert item.attachments[0].name == "申請表" and "每月補助" in item.attachments[0].text
    assert "## 附件：申請表" in item.content_md


def test_推送失敗_下次重試() -> None:
    state = State(":memory:")
    r, _ = run(items(2), state, "r1", sink=Sink(fail=True))
    assert (r.pushed, r.push_failed) == (0, 2)
    r, sink = run(items(2), state, "r2")
    assert (r.updated, r.pushed) == (2, 2)


def test_數量驟降視為改版_不推送也不判定下架() -> None:
    state = State(":memory:")
    run(items(20), state, "r1")
    r, sink = run(items(5), state, "r2")
    assert r.health == "degraded" and "seen 5" in r.health_detail
    assert sink.items == [] and sink.removed == []
    assert state.counts("kinmen").get("removed") is None


def test_完全抓不到_blocked() -> None:
    r, _ = run([], State(":memory:"), "r1")
    assert r.health == "blocked"


def test_連續兩次沒看到_通知後端下架() -> None:
    state = State(":memory:")
    run(items(12), state, "r1")
    run(items(11), state, "r2")
    _, sink = run(items(11), state, "r3")
    assert sink.removed == ["https://s.example/11"]


def test_開放資料_欄位轉成正文_原始欄位放structured() -> None:
    site = SITE.model_copy(update={"adapter": "opendata", "id": "taichung", "city": "臺中市"})
    import json

    rec = json.loads(fixture("taichung/disability.json"))[0]
    raw = RawItem(
        url="https://data.gov.tw/dataset/112089#1", title_hint=rec["補助名稱"], fields=rec, link="https://x.example/p"
    )
    sink = Sink()
    with MockWeb().fetcher() as f:
        SiteRun(site, FakeAdapter(site, f, [raw]), f, State(":memory:"), run_id="r", today=TODAY).run(sink)
    item = sink.items[0]
    assert item.source.kind == "opendata" and str(item.source.url) == "https://x.example/p"
    assert "- **應備文件**：" in item.content_md and "機關代碼" not in item.content_md
    assert item.structured["補助流水號"] == "1"
    assert item.program_key == "taichung:身心障礙者生活補助費"


def test_kinmen_fixture_end_to_end() -> None:
    url = "https://s.example/cp"
    raw = [RawItem(url=url, title_hint="中低收入老人生活津貼", html=fixture("kinmen/cp_item.html"))]
    _, sink = run(raw, State(":memory:"), "r1", web=MockWeb(default=html("")))
    assert sink.items[0].published_at == date(2024, 2, 22)


def test_抓得不完整_保留上次狀態_不推送也不判定下架() -> None:
    state = State(":memory:")
    run(items(12), state, "r1")
    broken = [*items(11), RawItem(url="https://s.example/11", incomplete=True)]
    for run_id in ("r2", "r3", "r4"):
        r, sink = run(broken, state, run_id)
        assert (r.updated, r.pushed, sink.removed) == (0, 0, [])
    # 網站恢復後內容沒變：不重新處理
    r, sink = run(items(12), state, "r5")
    assert (r.unchanged, r.pushed) == (12, 0)


def test_第一次就抓不完整的新網址_先略過() -> None:
    state = State(":memory:")
    r, sink = run([RawItem(url="https://s.example/x", incomplete=True), *items(11)], state, "r1")
    assert (r.new, r.pushed) == (11, 11)
    assert state.db.execute("SELECT count(*) FROM pages WHERE url = 'https://s.example/x'").fetchone()[0] == 0


def test_列表頁暫時抓不到_不判定下架() -> None:
    class Partial(FakeAdapter):
        def list_items(self) -> Iterator[RawItem]:
            self.listing_complete = False
            yield from self.items

    state = State(":memory:")
    run(items(12), state, "r1")
    for run_id in ("r2", "r3"):
        sink = Sink()
        with MockWeb().fetcher() as f:
            SiteRun(SITE, Partial(SITE, f, items(11)), f, state, run_id=run_id, today=TODAY).run(sink)
        assert sink.removed == []
    # 列表不完整的那幾次不算沒出現；恢復正常後要再連續 2 次沒看到才下架
    assert run(items(11), state, "r4")[1].removed == []
    assert run(items(11), state, "r5")[1].removed == ["https://s.example/11"]
