"""開放資料 adapter（L1 來源，docs/scraper.md §2）：資料集是 JSON 陣列，每一筆就是一個福利。

原始欄位整筆放進 `structured`，後端可以直接使用（資格、應備文件等），不必再交給 LLM 猜。
"""

import json
from collections.abc import Iterator
from typing import Any

from scraper.adapters.base import Adapter, RawItem
from scraper.fetch import FetchError


def _str(value: Any) -> str:
    return "" if value is None else str(value).strip()


class OpenData(Adapter):
    def list_items(self) -> Iterator[RawItem]:
        for ds in self.site.datasets:
            try:
                res = self.fetcher.get(ds.url)
            except FetchError as e:
                self.stats.errors.append(f"{e.reason} {ds.url}")
                continue
            self.stats.pages += 1
            try:
                records = json.loads(res.content.decode("utf-8-sig"))
            except (ValueError, UnicodeDecodeError) as e:
                self.stats.errors.append(f"bad_json {ds.url}: {e}")
                continue
            if not isinstance(records, list):
                self.stats.errors.append(f"not_a_list {ds.url}")
                continue
            for i, rec in enumerate(records):
                if not isinstance(rec, dict) or not _str(rec.get(ds.title)):
                    continue
                key = _str(rec.get(ds.id)) if ds.id else ""
                link = _str(rec.get(ds.link)) if ds.link else ""
                yield RawItem(
                    url=f"{ds.page_url}#{key or i + 1}",
                    title_hint=_str(rec[ds.title]),
                    fields={k: _str(v) for k, v in rec.items()},
                    link=link if link.startswith(("http://", "https://")) else ds.page_url,
                )
