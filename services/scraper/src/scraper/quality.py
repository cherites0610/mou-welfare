"""品質關卡（docs/scraper.md §6.6）：不合格的資料不推送，放入隔離區。

v1 在 selector 失效時把空白資料推進資料庫，這裡就是為了擋下那種情況。
"""

import re
from dataclasses import dataclass
from datetime import date, timedelta

MIN_TITLE_CHARS = 4
MIN_CONTENT_CHARS = 80
MAX_FUTURE = timedelta(days=366)

# 政府網站常把「找不到網頁」做成 200 回應（soft 404），只能看內容判斷
ERROR_PAGE = re.compile(
    r"請您再重新檢視輸入的網址|查無(此)?(資料|頁面|網頁)|(網頁|頁面|資料)不存在|找不到(您要的|此)?(網頁|頁面)"
    r"|page not found|404 not found"
    r"|系統發生錯誤|服務暫停|維護中",
    re.I,
)
ERROR_PAGE_MAX_CHARS = 600  # 只檢查短內容，避免正文裡剛好提到「查無資料」的福利被誤判


@dataclass(frozen=True)
class Candidate:
    title: str
    content: str
    published_at: date | None


def quality_issues(c: Candidate, today: date) -> list[str]:
    issues: list[str] = []
    if len(c.title.strip()) < MIN_TITLE_CHARS:
        issues.append("title_too_short")
    if len(c.content.strip()) < MIN_CONTENT_CHARS:
        issues.append("content_too_short")
    if len(c.content) <= ERROR_PAGE_MAX_CHARS and ERROR_PAGE.search(c.content):
        issues.append("error_page")
    if c.published_at is not None and c.published_at > today + MAX_FUTURE:
        issues.append("date_in_far_future")
    return issues
