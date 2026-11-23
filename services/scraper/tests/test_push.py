import hashlib
import hmac
import json

import httpx
import pytest
from test_contract import sample

from scraper.push import Pusher, PushError, sign

KEY = "k" * 32


def test_簽章格式() -> None:
    expected = hmac.new(KEY.encode(), b"1700000000.{}", hashlib.sha256).hexdigest()
    assert sign(KEY, 1700000000, b"{}") == f"sha256={expected}"


def test_推送帶時間戳與簽章_後端可驗證() -> None:
    seen: list[httpx.Request] = []

    def handler(req: httpx.Request) -> httpx.Response:
        seen.append(req)
        return httpx.Response(202)

    client = httpx.Client(transport=httpx.MockTransport(handler))
    p = Pusher("https://api.example/", KEY, client=client, clock=lambda: 1700000000.5)
    p.ingest(sample())
    p.remove("kinmen", ["https://a.example/1"])
    p.remove("kinmen", [])  # 沒有要下架的就不送

    assert [str(r.url) for r in seen] == ["https://api.example/internal/ingest", "https://api.example/internal/remove"]
    req = seen[0]
    assert req.headers["X-Mou-Timestamp"] == "1700000000"
    assert req.headers["X-Mou-Signature"] == sign(KEY, 1700000000, req.content)
    assert json.loads(req.content)["program_key"] == "kinmen:中低收入老人生活津貼"


def test_後端拒絕時丟出錯誤() -> None:
    client = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(401, text="bad signature")))
    with pytest.raises(PushError, match="http_401"):
        Pusher("https://api.example", KEY, client=client).ingest(sample())


def test_金鑰太短拒絕() -> None:
    with pytest.raises(ValueError):
        Pusher("https://api.example", "short")


def test_replay_把dry_run結果推送(tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch) -> None:
    from typer.testing import CliRunner

    from scraper import cli

    run_dir = tmp_path  # type: ignore[assignment]
    (run_dir / "kinmen.jsonl").write_text(
        json.dumps(sample().to_payload(), ensure_ascii=False) + "\n", encoding="utf-8"
    )  # type: ignore[operator]
    seen: list[httpx.Request] = []
    real_client = httpx.Client

    def fake_client(**kw: object) -> httpx.Client:
        return real_client(transport=httpx.MockTransport(lambda r: seen.append(r) or httpx.Response(200)))

    monkeypatch.setattr(httpx, "Client", fake_client)
    monkeypatch.setenv("API_BASE", "https://api.example")
    monkeypatch.setenv("INGEST_HMAC_KEY", KEY)
    result = CliRunner().invoke(cli.app, ["replay", str(run_dir)])
    assert result.exit_code == 0, result.output
    assert "kinmen     pushed 1" in result.output
    assert [str(r.url) for r in seen] == ["https://api.example/internal/ingest"]


def test_run_push_回報進度_一站失敗不影響其他站(
    tmp_path: pytest.TempPathFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    from typer.testing import CliRunner

    from scraper import cli

    seen: list[httpx.Request] = []
    real_client = httpx.Client

    def fake_client(**kw: object) -> httpx.Client:
        return real_client(transport=httpx.MockTransport(lambda r: seen.append(r) or httpx.Response(200)))

    def broken_adapter(cfg: object, fetcher: object) -> object:
        raise RuntimeError("設定錯誤")

    monkeypatch.setattr(httpx, "Client", fake_client)
    monkeypatch.setattr(cli, "get_adapter", broken_adapter)
    monkeypatch.setenv("API_BASE", "https://api.example")
    monkeypatch.setenv("INGEST_HMAC_KEY", KEY)
    out = tmp_path  # type: ignore[assignment]
    args = ["run", "--push", "--site", "kinmen", "--site", "klcg", "--trigger", "schedule", "--interval-days", "3"]
    result = CliRunner().invoke(cli.app, [*args, "--state", str(out / "s.db"), "--out", str(out)])  # type: ignore[operator]
    assert result.exit_code == 1  # 有站點不是 ok

    reports = [json.loads(r.content) for r in seen if r.url.path == "/internal/scrape-runs"]
    assert [(r["current"], len(r["sites"]), r["finished"]) for r in reports] == [
        ("kinmen", 0, False),
        ("klcg", 1, False),
        (None, 2, True),
    ]
    last = reports[-1]
    assert last["trigger"] == "schedule" and last["interval_days"] == 3 and last["planned"] == ["kinmen", "klcg"]
    s = last["sites"][0]
    assert s["site_id"] == "kinmen" and s["city"] == "金門縣" and s["health"] == "failed"
    assert s["health_detail"] == "RuntimeError: 設定錯誤" and s["started_at"] and s["finished_at"]
