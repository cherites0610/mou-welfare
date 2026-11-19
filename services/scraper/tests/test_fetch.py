import pytest
from conftest import MockWeb, html

from scraper.fetch import USER_AGENT, Fetcher, FetchError, RobotsDenied

BASE = "https://example.gov.tw"


def test_遵守robots() -> None:
    web = MockWeb(
        {
            f"{BASE}/robots.txt": (200, "User-agent: *\nDisallow: /private/\n", "text/plain"),
            f"{BASE}/ok": html("<p>ok</p>"),
        }
    )
    with web.fetcher() as f:
        assert f.get(f"{BASE}/ok").status == 200
        with pytest.raises(RobotsDenied):
            f.get(f"{BASE}/private/x")
    assert f"{BASE}/private/x" not in web.requests
    assert web.requests.count(f"{BASE}/robots.txt") == 1  # 每個主機只讀一次


def test_robots_回傳html首頁時視為允許() -> None:
    web = MockWeb({f"{BASE}/robots.txt": html("<html>首頁</html>"), f"{BASE}/a": html("a")})
    with web.fetcher() as f:
        assert f.get(f"{BASE}/a").status == 200


def test_5xx_重試後成功() -> None:
    calls = {"n": 0}

    def flaky(url: str) -> tuple[int, str, str] | None:
        if url.endswith("/robots.txt"):
            return None
        calls["n"] += 1
        return (503, "busy", "text/plain") if calls["n"] < 3 else html("ok")

    with MockWeb(default=flaky).fetcher(retries=3) as f:
        assert f.get(f"{BASE}/x").text == "ok"
    assert calls["n"] == 3


def test_重試用完就丟出錯誤() -> None:
    web = MockWeb(default=lambda url: None if url.endswith("robots.txt") else (502, "", "text/plain"))
    with web.fetcher(retries=1) as f, pytest.raises(FetchError) as e:
        f.get(f"{BASE}/x")
    assert e.value.reason == "http_502"


def test_檔案太大不下載() -> None:
    web = MockWeb({f"{BASE}/big.pdf": (200, b"x" * 2000, "application/pdf")})
    with web.fetcher() as f, pytest.raises(FetchError) as e:
        f.get(f"{BASE}/big.pdf", max_bytes=1000)
    assert e.value.reason == "too_large"


def test_同一主機的請求間隔() -> None:
    sleeps: list[float] = []
    now = [100.0]
    web = MockWeb(default=html("ok"))
    import httpx

    client = httpx.Client(transport=httpx.MockTransport(web.handler))
    f = Fetcher(delay=2.0, client=client, sleep=sleeps.append, clock=lambda: now[0])
    f.get(f"{BASE}/a")  # robots.txt + /a：同一時間點連續兩次請求
    now[0] += 0.5
    f.get(f"{BASE}/b")
    assert sleeps == [2.0, 1.5]


def test_user_agent_寫明身分() -> None:
    assert "MouWelfareBot" in USER_AGENT and "mou-welfare.com" in USER_AGENT
