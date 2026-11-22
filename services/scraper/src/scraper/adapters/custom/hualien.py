"""花蓮縣政府社會處（C 族）：sa.hl.gov.tw。

列表頁是 `/List_sp/{32 碼 guid}`（分類底下還有子列表），內文頁是 `/Detail_sp/{guid}`；
列表與內文都在 `div.In_box` 裡，選單和頁尾在外面。
"""

from scraper.adapters.crawl import LinkCrawler


class Adapter(LinkCrawler):
    DEFAULTS = {
        "follow": r"/List_sp/[0-9a-f]{32}$",
        "detail": r"/Detail_sp/[0-9a-f]{32}$",
        "region": "div.In_box div.all_list",
        "body": "div.In_box",
        "content": "div.In_box div.edit_box",
    }
