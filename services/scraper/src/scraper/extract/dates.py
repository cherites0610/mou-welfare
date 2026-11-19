"""日期解析：支援西元與民國年，以及「發布日期：113-05-02」這類標籤。"""

import re
from datetime import date

_SEP = r"\s*[-/.年]\s*"
_DATE = rf"(\d{{2,4}}){_SEP}(\d{{1,2}}){_SEP.replace('年', '月')}(\d{{1,2}})"
# 依優先順序：發布日期 > 公告日期 > 單獨的「日期」；不採用「更新日期」（每天都可能變）
_LABELED = [
    re.compile(rf"(?:發布|發佈|公告|上稿|刊登)(?:日期|時間)\s*[：:]?\s*{_DATE}"),
    re.compile(rf"(?<![更新修改])日期\s*[：:]\s*{_DATE}"),
]


def to_date(year: str, month: str, day: str) -> date | None:
    y = int(year)
    if y < 1000:  # 民國年
        y += 1911
    try:
        return date(y, int(month), int(day))
    except ValueError:
        return None


def find_published_date(text: str) -> date | None:
    for pattern in _LABELED:
        m = pattern.search(text)
        if m and (d := to_date(*m.groups())):
            return d
    return None
