"""彰化縣政府社會處（C 族）：www.chcg.gov.tw/DTO/social（新網域 social.chcg.gov.tw 會轉址到這裡）。

「津貼及補助專區」（service01_list.aspx?cate_id=2434）本身就是整理好的福利清單，用 page 參數分頁；
內文頁是 service01_con.aspx?topsn=&data_id=，附件是 getFile.aspx?file_id=。
"""

from scraper.adapters.crawl import LinkCrawler


class Adapter(LinkCrawler):
    DEFAULTS = {
        "detail": r"/06service/service01_con\.aspx\?topsn=\d+&data_id=\d+$",
        "region": "div.pages_content_blcok-table",
        "body": "div.pages-content-main-wrapper, div.pages_content_blcok-files",
        "content": "div.pages-content-main-wrapper div.article-desc",
    }
