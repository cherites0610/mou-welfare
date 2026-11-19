"""基隆市政府社會處（C 族）：www.klcg.gov.tw/tw/social/。

列表頁是 `/tw/social/{分類}.html`，內文頁是 `/tw/social/{分類}-{編號}.html`；
主要內容都在 `div.center_block` 裡，選單和頁尾在外面。
"""

from scraper.adapters.crawl import LinkCrawler


class Adapter(LinkCrawler):
    DEFAULTS = {
        "follow": r"/tw/social/\d+\.html$",
        "detail": r"/tw/social/\d+-\d+\.html$",
        "region": "div.center_block",
        "body": "div.center_block",
    }
