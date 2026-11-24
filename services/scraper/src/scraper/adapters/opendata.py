"""開放資料 adapter（L1 來源，docs/scraper.md §2）：資料集是 JSON 陣列或 CSV，每一筆就是一個福利。

原始欄位整筆放進 `structured`，後端可以直接使用（資格、應備文件等），不必再交給 LLM 猜。
"""

import csv
import io
import json
from collections.abc import Iterator
from typing import Any

from scraper.adapters.base import Adapter, RawItem
from scraper.fetch import FetchError


def _str(value: Any) -> str:
    return "" if value is None else str(value).strip()


def parse_records(content: bytes, fmt: str) -> list[Any]:
    """JSON 陣列或 CSV（第一列為欄位名稱）。欄位名稱去掉 BOM：臺南的 CSV 開頭有兩個 BOM。"""
    text = content.decode("utf-8-sig")
    if fmt == "csv":
        rows = csv.DictReader(io.StringIO(text))
        return [{(k or "").lstrip("\ufeff").strip(): v for k, v in row.items()} for row in rows]
    data = json.loads(text)
    if not isinstance(data, list):
        raise ValueError("not_a_list")
    return data


class OpenData(Adapter):
    def list_items(self) -> Iterator[RawItem]:
        for ds in self.site.datasets:
            try:
                res = self.fetcher.get(ds.url)
            except FetchError as e:
                self.stats.errors.append(f"{e.reason} {ds.url}")
                self.listing_complete = False
                continue
            self.stats.pages += 1
            try:
                records = parse_records(res.content, ds.format)
            except (ValueError, UnicodeDecodeError, csv.Error) as e:
                self.stats.errors.append(f"bad_{ds.format} {ds.url}: {e}")
                continue
            for i, rec in enumerate(records):
                if not isinstance(rec, dict) or not _str(rec.get(ds.title)):
                    continue
                key = _str(rec.get(ds.id)) if ds.id else ""
                link = _str(rec.get(ds.link)) if ds.link else ""
                yield RawItem(
                    url=f"{ds.page_url}#{key or i + 1}",
                    title_hint=_str(rec[ds.title]),
                    fields={ds.labels.get(str(k), str(k)): _str(v) for k, v in rec.items()},
                    link=link if link.startswith(("http://", "https://")) else ds.page_url,
                )
