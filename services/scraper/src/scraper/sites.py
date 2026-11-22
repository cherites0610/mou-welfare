"""站點設定（sites/*.yaml，docs/scraper.md §6.1）。

同一族網站共通的值（連結規則、內容區塊的 selector）寫在 adapter 的預設值裡，
站點設定只需要提供起點網址；有差異時才在 YAML 覆寫。
"""

from pathlib import Path
from typing import Literal

import yaml
from pydantic import BaseModel, Field

SITES_DIR = Path(__file__).resolve().parents[2] / "sites"


class Seed(BaseModel):
    url: str
    label: str


class Pagination(BaseModel):
    param: str
    max: int = Field(default=20, ge=1, le=200)
    extra: dict[str, str] = Field(default_factory=dict)  # 例如 pagesize=50


class Dataset(BaseModel):
    """開放資料集（opendata adapter）：一個資料集就是一個 JSON 陣列，每筆是一個福利。"""

    url: str
    label: str
    format: Literal["json", "csv"] = "json"
    title: str  # 福利名稱的欄位
    link: str | None = None  # 原始網頁連結的欄位（沒有就用 page_url）
    id: str | None = None  # 流水號欄位，用來組出穩定的來源網址
    page_url: str  # 資料集頁面（data.gov.tw）
    labels: dict[str, str] = Field(default_factory=dict)  # 欄位名稱改為中文（例如桃園用英文欄位名）


class SiteConfig(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    city: str
    adapter: Literal["cms_a", "cms_b", "opendata", "portal"] | str
    base_url: str
    seeds: list[Seed] = Field(default_factory=list)
    datasets: list[Dataset] = Field(default_factory=list)
    follow: str | None = None  # 列表頁之間可往下走的連結（正規表示式，比對完整網址）
    detail: str | None = None  # 內文頁連結
    region: str | None = None  # 找連結的區塊（CSS selector），避免走到選單和頁尾
    body: str | None = None  # 內文區塊（找附件用）
    content: str | None = None  # 正文區塊（trafilatura 失敗時的備援；沒有就用 body）
    max_depth: int = Field(default=2, ge=0, le=5)
    max_pages: int = Field(default=600, ge=1, le=5000)  # 每次執行最多抓幾頁（列表 + 內文，不含附件）
    # A 族的 cp.aspx?n=X 底下的 &s= 是同一福利的分頁籤（臺北：服務內容／應備文件／洽辦窗口），合併成一筆；
    # 預設 false：金門等站的 &s= 是各自獨立的福利
    merge_tabs: bool = False
    pagination: Pagination | None = None
    drop_params: list[str] = Field(default_factory=list)  # 正規化網址時去掉的參數
    extra_hosts: list[str] = Field(
        default_factory=list
    )  # 除了 base_url 以外，內文頁可以在哪些主機（例如縣市的線上申辦網站）
    # 不抓的網址（正規表示式）：福利專區底下的機構管理、捐款徵信等分類，從範圍就排除（去雜訊第 1 層）
    exclude_urls: list[str] = Field(default_factory=list)
    exclude_title: list[str] = Field(default_factory=list)
    expect: dict[str, int] = Field(default_factory=dict)
    generated_by: str | None = None

    @property
    def kind(self) -> Literal["cms", "opendata", "portal"]:
        if self.adapter == "opendata":
            return "opendata"
        if self.adapter == "portal":
            return "portal"
        return "cms"


def load_sites(directory: Path = SITES_DIR) -> dict[str, SiteConfig]:
    sites: dict[str, SiteConfig] = {}
    for path in sorted(directory.glob("*.yaml")):
        cfg = SiteConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        if cfg.id != path.stem:
            raise ValueError(f"{path.name}: id '{cfg.id}' 必須與檔名一致")
        if not cfg.seeds and not cfg.datasets:
            raise ValueError(f"{path.name}: 至少要有一個 seeds 或 datasets")
        sites[cfg.id] = cfg
    return sites
