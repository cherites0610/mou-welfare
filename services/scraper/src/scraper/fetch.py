"""抓取層（docs/scraper.md §4.2 禮貌爬取規則）。

- 整個執行過程共用一個 httpx client；同一主機的請求依序進行，間隔至少 `delay` 秒。
- 遵守 robots.txt（取不到 robots.txt 時視為允許）。
- User-Agent 寫明身分與聯絡方式。
- 逾時、連線錯誤、429、5xx 會以指數退避重試。
- HTML 沒有結尾標籤（`</html>`／`</body>`）視為截斷並重試；重試用完仍截斷時回傳 `complete=False`
  （金門偶爾回 200，但頁面在 <head> 中途就結束，Content-Length 也是截斷後的長度）。
- 同一主機連續 3 次連不上（連線逾時或拒絕），這次執行就不再連它，避免每個請求都等到逾時
  （宜蘭的附件主機有一個 IP 不通，曾讓單一頁面卡住 10 分鐘以上）。
"""

import re
import time
from collections.abc import Callable
from dataclasses import dataclass, replace
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx

USER_AGENT = "MouWelfareBot/2.0 (+https://mou-welfare.com/bot)"
RETRY_STATUS = frozenset({429, 500, 502, 503, 504})
MAX_BYTES = 15 * 1024 * 1024  # 附件上限：超過就不下載
CONNECT_TIMEOUT = 10.0
HOST_DOWN_AFTER = 3  # 連續幾次連線失敗後視為主機無法連線
# 這兩種是頁面本身的狀況；其他（逾時、連線錯誤、5xx、截斷、主機連不上）是網站暫時出問題，
# 內文頁抓不到時保留上次的狀態，不算這次沒出現（連續沒出現會被當成下架）
PERMANENT_REASONS = frozenset({"too_large", "robots_disallow"})
_HTML_END = re.compile(rb"</(?:html|body)\s*>", re.IGNORECASE)


class FetchError(Exception):
    def __init__(self, url: str, reason: str) -> None:
        super().__init__(f"{reason}: {url}")
        self.url = url
        self.reason = reason


class RobotsDenied(FetchError):
    def __init__(self, url: str) -> None:
        super().__init__(url, "robots_disallow")


@dataclass(frozen=True)
class Response:
    url: str  # 轉址後的最終網址
    status: int
    content_type: str
    content: bytes
    encoding: str | None
    complete: bool = True  # False＝HTML 被截斷（重試後仍是如此）

    @property
    def text(self) -> str:
        return self.content.decode(self.encoding or "utf-8", errors="replace")


class Fetcher:
    def __init__(
        self,
        *,
        delay: float = 2.0,
        timeout: float = 30.0,
        retries: int = 3,
        client: httpx.Client | None = None,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.delay = delay
        self.retries = retries
        self._client = client or httpx.Client(
            headers={"User-Agent": USER_AGENT, "Accept-Language": "zh-TW,zh;q=0.9"},
            timeout=httpx.Timeout(timeout, connect=CONNECT_TIMEOUT),
            follow_redirects=True,
        )
        self._sleep = sleep
        self._clock = clock
        self._last: dict[str, float] = {}
        self._robots: dict[str, RobotFileParser | None] = {}
        self._connect_failures: dict[str, int] = {}
        self.requests = 0

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "Fetcher":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def get(self, url: str, *, max_bytes: int = MAX_BYTES, retries: int | None = None) -> Response:
        if self.host_down(url):
            raise FetchError(url, "host_down")
        if not self.allowed(url):
            raise RobotsDenied(url)
        return self._request(url, max_bytes, retries)

    def host_down(self, url: str) -> bool:
        return self._connect_failures.get(urlsplit(url).netloc, 0) >= HOST_DOWN_AFTER

    def allowed(self, url: str) -> bool:
        parts = urlsplit(url)
        origin = f"{parts.scheme}://{parts.netloc}"
        if origin not in self._robots:
            self._robots[origin] = self._load_robots(origin)
        rp = self._robots[origin]
        return rp is None or rp.can_fetch(USER_AGENT, url)

    def _load_robots(self, origin: str) -> RobotFileParser | None:
        try:
            res = self._request(f"{origin}/robots.txt", 512 * 1024, retries=0)
        except FetchError:
            return None
        if res.status >= 400 or "html" in res.content_type:
            return None  # 很多政府網站沒有 robots.txt，回 404 或首頁
        rp = RobotFileParser()
        rp.parse(res.text.splitlines())
        return rp

    def _throttle(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            wait = self.delay - (self._clock() - last)
            if wait > 0:
                self._sleep(wait)
        self._last[host] = self._clock()

    def _request(self, url: str, max_bytes: int, retries: int | None = None) -> Response:
        host = urlsplit(url).netloc
        attempts = (self.retries if retries is None else retries) + 1
        reason = "unknown"
        truncated: Response | None = None
        for attempt in range(attempts):
            if self._connect_failures.get(host, 0) >= HOST_DOWN_AFTER:
                raise FetchError(url, "host_down")
            if attempt:
                self._sleep(min(2**attempt * self.delay, 60))
            self._throttle(host)
            self.requests += 1
            try:
                with self._client.stream("GET", url) as res:
                    self._connect_failures.pop(host, None)
                    if res.status_code in RETRY_STATUS:
                        reason = f"http_{res.status_code}"
                        continue
                    declared = int(res.headers.get("content-length") or 0)
                    if declared > max_bytes:
                        raise FetchError(url, "too_large")
                    body = bytearray()
                    for chunk in res.iter_bytes():
                        body.extend(chunk)
                        if len(body) > max_bytes:
                            raise FetchError(url, "too_large")
                    response = Response(
                        url=str(res.url),
                        status=res.status_code,
                        content_type=res.headers.get("content-type", "").lower(),
                        content=bytes(body),
                        encoding=res.encoding,
                    )
                    if response.status < 400 and "html" in response.content_type and not _HTML_END.search(body):
                        reason = "truncated"
                        truncated = replace(response, complete=False)
                        continue
                    return response
            except (httpx.ConnectError, httpx.ConnectTimeout) as e:
                reason = type(e).__name__
                self._connect_failures[host] = self._connect_failures.get(host, 0) + 1
            except (httpx.TimeoutException, httpx.TransportError) as e:
                reason = type(e).__name__
        if truncated is not None:
            return truncated
        raise FetchError(url, reason)
