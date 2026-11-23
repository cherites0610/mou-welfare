"""推送到後端（docs/scraper.md §7、docs/backend.md §6）。

簽章：`X-Mou-Timestamp: <unix 秒>`、`X-Mou-Signature: sha256=<hex>`，
其中 hex = HMAC-SHA256(INGEST_HMAC_KEY, f"{timestamp}.{body}")。後端驗證時間戳在 5 分鐘內。
"""

import hashlib
import hmac
import json
import time
from collections.abc import Callable
from typing import Any

import httpx

from scraper.fetch import USER_AGENT
from scraper.models import IngestItem


def sign(key: str, timestamp: int, body: bytes) -> str:
    mac = hmac.new(key.encode(), f"{timestamp}.".encode() + body, hashlib.sha256)
    return "sha256=" + mac.hexdigest()


class PushError(Exception):
    pass


class Pusher:
    def __init__(
        self,
        api_base: str,
        key: str,
        *,
        client: httpx.Client | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if len(key) < 32:
            raise ValueError("INGEST_HMAC_KEY 至少 32 字元")
        self.api_base = api_base.rstrip("/")
        self.key = key
        self._client = client or httpx.Client(timeout=30.0, headers={"User-Agent": USER_AGENT})
        self._clock = clock

    def close(self) -> None:
        self._client.close()

    def _post(self, path: str, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
        ts = int(self._clock())
        try:
            res = self._client.post(
                f"{self.api_base}{path}",
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Mou-Timestamp": str(ts),
                    "X-Mou-Signature": sign(self.key, ts, body),
                },
            )
        except httpx.HTTPError as e:
            raise PushError(f"{path}: {type(e).__name__}") from e
        if res.status_code >= 300:
            raise PushError(f"{path}: http_{res.status_code} {res.text[:200]}")

    def ingest(self, item: IngestItem) -> None:
        self._post("/internal/ingest", item.to_payload())

    def report_run(self, payload: dict[str, Any]) -> None:
        """執行進度回報（管理後台的爬蟲頁，docs/admin.md §4.6）。"""
        self._post("/internal/scrape-runs", payload)

    def remove(self, site_id: str, urls: list[str]) -> None:
        if urls:
            self._post("/internal/remove", {"site_id": site_id, "urls": urls})
