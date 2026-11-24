"""測試共用工具：存成檔案的 HTML 快照 + 假的 HTTP 傳輸層，整個測試不連網路。"""

from collections.abc import Callable
from pathlib import Path

import httpx
import pytest

from scraper.fetch import Fetcher

FIXTURES = Path(__file__).parent / "fixtures"

Route = tuple[int, bytes | str, str]  # (status, body, content-type)


def fixture(name: str) -> str:
    return (FIXTURES / name).read_text(encoding="utf-8")


def html(body: str, status: int = 200) -> Route:
    """完整的 HTML 回應；片段會補上結尾標籤（沒有結尾的 HTML 會被當成截斷，見 fetch.py）。"""
    if "</html" not in body.lower() and "</body" not in body.lower():
        body += "</html>"
    return (status, body, "text/html; charset=utf-8")


def truncated(body: str = "<html><head><title>x</title>") -> Route:
    """伺服器回 200 但頁面中途就結束（金門偶爾會這樣）"""
    return (200, body, "text/html; charset=utf-8")


class MockWeb:
    """以完整網址對應回應；沒有設定的網址回 404。記錄所有請求。"""

    def __init__(
        self, routes: dict[str, Route] | None = None, default: Route | Callable[[str], Route | None] | None = None
    ) -> None:
        self.routes: dict[str, Route] = dict(routes or {})
        self.default = default  # 沒有設定的網址：固定回應，或依網址決定（None 表示 404）
        self.requests: list[str] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        self.requests.append(url)
        route = self.routes.get(url)
        if route is None:
            route = self.default(url) if callable(self.default) else self.default
        if route is None:
            return httpx.Response(404, text="not found", headers={"content-type": "text/plain"})
        status, body, ctype = route
        content = body.encode("utf-8") if isinstance(body, str) else body
        return httpx.Response(status, content=content, headers={"content-type": ctype})

    def fetcher(self, **kwargs: object) -> Fetcher:
        client = httpx.Client(transport=httpx.MockTransport(self.handler), follow_redirects=True)
        return Fetcher(delay=0, client=client, sleep=lambda _: None, **kwargs)  # type: ignore[arg-type]


@pytest.fixture
def web() -> MockWeb:
    return MockWeb()
