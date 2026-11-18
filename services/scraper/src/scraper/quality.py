"""品質關卡（docs/scraper.md §6.6）：不合格的資料不推送，放入隔離區。

v1 在 selector 失效時把空白資料推進資料庫，這裡就是為了擋下那種情況。
"""

from dataclasses import dataclass
from datetime import date, timedelta

MIN_TITLE_CHARS = 4
MIN_CONTENT_CHARS = 80
MAX_FUTURE = timedelta(days=366)


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
    if c.published_at is not None and c.published_at > today + MAX_FUTURE:
        issues.append("date_in_far_future")
    return issues
