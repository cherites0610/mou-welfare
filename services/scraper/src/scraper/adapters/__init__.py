"""依站點設定的 `adapter` 欄位取得對應的 adapter。"""

import importlib

from scraper.adapters.base import Adapter, RawItem
from scraper.adapters.crawl import CmsA, CmsB, LinkCrawler
from scraper.adapters.opendata import OpenData
from scraper.fetch import Fetcher
from scraper.sites import SiteConfig

_BUILTIN: dict[str, type[Adapter]] = {"cms_a": CmsA, "cms_b": CmsB, "opendata": OpenData}


def adapter_class(name: str) -> type[Adapter]:
    if name in _BUILTIN:
        return _BUILTIN[name]
    if name.startswith("custom:"):
        module = importlib.import_module(f"scraper.adapters.custom.{name.removeprefix('custom:')}")
        cls: type[Adapter] = module.Adapter
        return cls
    raise ValueError(f"unknown adapter: {name}")


def get_adapter(site: SiteConfig, fetcher: Fetcher) -> Adapter:
    return adapter_class(site.adapter)(site, fetcher)


__all__ = ["Adapter", "LinkCrawler", "RawItem", "adapter_class", "get_adapter"]
