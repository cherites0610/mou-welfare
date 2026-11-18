"""站點設定（sites/*.yaml，docs/scraper.md §6.1）。"""

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


class SiteConfig(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_-]+$")
    city: str
    adapter: Literal["cms_a", "cms_b", "opendata", "portal"] | str
    base_url: str
    seeds: list[Seed] = Field(min_length=1)
    follow: str | None = None
    detail: str | None = None
    pagination: Pagination | None = None
    exclude_title: list[str] = Field(default_factory=list)
    expect: dict[str, int] = Field(default_factory=dict)
    generated_by: str | None = None


def load_sites(directory: Path = SITES_DIR) -> dict[str, SiteConfig]:
    sites: dict[str, SiteConfig] = {}
    for path in sorted(directory.glob("*.yaml")):
        cfg = SiteConfig.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        if cfg.id != path.stem:
            raise ValueError(f"{path.name}: id '{cfg.id}' 必須與檔名一致")
        sites[cfg.id] = cfg
    return sites
