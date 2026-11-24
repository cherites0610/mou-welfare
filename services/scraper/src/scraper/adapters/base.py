"""Adapter 介面（docs/scraper.md §3）：每種來源一個 adapter，只負責「列出內文」。

抽取、去雜訊、狀態比對都在後面的通用流程處理，adapter 不需要知道。
"""

from abc import ABC, abstractmethod
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any

from scraper.fetch import Fetcher
from scraper.sites import SiteConfig


@dataclass(frozen=True)
class RawItem:
    url: str  # 狀態表的鍵，必須穩定且唯一
    title_hint: str | None = None  # 列表上的連結文字
    html: str | None = None  # 網頁來源
    fields: dict[str, Any] | None = None  # 結構化來源（開放資料）
    link: str | None = None  # 給使用者看的原始網址（沒有就用 url）
    # 網站暫時出問題、這次抓不完整（截斷、逾時、分頁籤缺一頁）：保留上次的狀態，不重新處理也不算沒出現
    incomplete: bool = False


@dataclass
class AdapterStats:
    pages: int = 0  # 抓了幾頁（列表 + 內文）
    errors: list[str] = field(default_factory=list)


class Adapter(ABC):
    def __init__(self, site: SiteConfig, fetcher: Fetcher) -> None:
        self.site = site
        self.fetcher = fetcher
        self.stats = AdapterStats()
        # 有列表／目錄頁或資料集因為網站暫時出問題沒抓到：這次看不到的網址可能只是沒被找到，不能判定下架
        self.listing_complete = True

    @abstractmethod
    def list_items(self) -> Iterator[RawItem]: ...

    @property
    def body_selector(self) -> str | None:
        """內文區塊（找附件用）；None 表示交給抽取模組自行判斷。"""
        return self.site.body

    @property
    def content_selector(self) -> str | None:
        """正文區塊（trafilatura 失敗時的備援）。"""
        return self.site.content
