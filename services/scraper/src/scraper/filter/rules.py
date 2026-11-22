"""去雜訊第 2 層：標題規則（docs/scraper.md §6.5）。"""

from typing import Literal

# 直接排除：會議紀錄、採購、對團體的補助等
EXCLUDE_KEYWORDS: tuple[str, ...] = (
    "會議紀錄", "會議記錄", "開會通知", "招標", "採購", "決標", "徵才", "甄選", "新聞稿",
    "活動花絮", "成果", "志工", "評鑑", "徵選補助單位", "補助民間團體", "核銷", "公開徵信",
    "統計", "預算", "決算",
    # 違反○○法公告：多半列出受處分人姓名，不是福利，也不應該進資料庫（2026-11 桃園）
    "違反",
)  # fmt: skip

# 加分：很可能是個人可申請的福利
BOOST_KEYWORDS: tuple[str, ...] = (
    "補助", "津貼", "給付", "救助", "減免", "申請", "資格", "費用補助", "生活扶助",
)  # fmt: skip

Verdict = Literal["exclude", "boost", "neutral"]


def judge_title(title: str, extra_exclude: tuple[str, ...] = ()) -> Verdict:
    """排除優先於加分：「補助民間團體」雖含「補助」仍應排除。"""
    if any(k in title for k in (*EXCLUDE_KEYWORDS, *extra_exclude)):
        return "exclude"
    if any(k in title for k in BOOST_KEYWORDS):
        return "boost"
    return "neutral"
