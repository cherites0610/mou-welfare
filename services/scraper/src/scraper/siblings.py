"""同一站裡 program_key 相同的網址（docs/scraper.md §6.5）。

program_key 會去掉年度與行政用語，讓同一福利不同年度的公告落在同一個鍵；但同一個鍵底下其實有三種情況：

1. 同一頁出現在兩個網址（內容幾乎相同）→ 保留一份。
2. 同一福利的不同年度或期別（每一份都標了年度或期別、而且都不同）→ 只保留最新的。
3. 標題相同但其實是不同的福利（金門三個「申請社會救助專戶」分別給低收入戶、身障、老人）→ 拆成不同的鍵。

沒有這一步時，同一個鍵的網址互相覆蓋，資料庫留下哪一份取決於推送順序（2026-11-24 有 41 個鍵、91 個網址）。
發布日期不拿來判斷版本：標題相同的不同福利也常有不同的發布日期（金門三個「中心介紹」）。
"""

import difflib
import hashlib
import re
import unicodedata
from dataclasses import dataclass
from datetime import date

# 同一頁的判斷：97% 以上一律算；92% 以上而且提到的身分相同才算。
# 同一福利的新舊兩頁只差排版或幾句修訂約 95%（花蓮）；標題相同的不同福利只差身分那幾個字時
# 可能高達 92.5%（金門的「申請社會救助專戶」分別給領身障生活補助、低收入戶的人）。
# 不列「榮民」：常出現在排除條款（「未領有榮民院外就養金者」），新舊版本間會變
SAME_PAGE_RATIO = 0.97
SIMILAR_RATIO = 0.92
_IDENTITY_TERMS = {
    "低收入戶": r"(?<!中)低收入戶",
    "中低收入": r"中低收入",
    "身心障礙": r"身心障礙|身障",
    "原住民": r"原住民",
    "新住民": r"新住民|外籍配偶|外配|大陸配偶",
    "特殊境遇": r"特殊境遇",
    "老人": r"老人|長者|65\s*歲",
    "兒少": r"兒童|少年|幼兒|嬰兒",
    "婦女": r"婦女|孕婦|懷孕",
}
_SAMPLE_CHARS = 5_000
_YEAR_CHARS = 3_000
_ROC_YEAR = re.compile(r"(?<!\d)(1[01]\d)\s*年")
_AD_YEAR = re.compile(r"(?<!\d)(20[0-4]\d)\s*年")
_PERIOD = re.compile(r"第\s*([\d一二三四五六七八九十]+)\s*[期梯]")
_CN_DIGITS = {c: i for i, c in enumerate("零一二三四五六七八九", 0)}


@dataclass(frozen=True)
class Member:
    url: str
    content_hash: str
    title: str
    content: str
    published_at: date | None = None


@dataclass(frozen=True)
class Decision:
    """`key`：推送用的 program_key；`keep=False`：被同一福利的另一份取代，不推送。"""

    key: str
    keep: bool
    reason: str = ""  # duplicate | older_version


def latest_year(text: str) -> int | None:
    """文字裡最晚的年度（民國）；西元換算成民國。"""
    s = unicodedata.normalize("NFKC", text)
    years = [int(y) for y in _ROC_YEAR.findall(s)] + [int(y) - 1911 for y in _AD_YEAR.findall(s)]
    return max(years) if years else None


def period(title: str) -> int | None:
    """標題的期別（第 2 期、第十梯）"""
    m = _PERIOD.search(unicodedata.normalize("NFKC", title))
    if not m:
        return None
    raw = m.group(1)
    if raw.isdigit():
        return int(raw)
    # 一～九十九：十＝10、十二＝12、二十＝20
    tens, _, ones = raw.partition("十")
    if "十" not in raw:
        return _CN_DIGITS.get(raw)
    return (_CN_DIGITS.get(tens, 1) if tens else 1) * 10 + (_CN_DIGITS.get(ones, 0) if ones else 0)


def _norm(text: str) -> str:
    return re.sub(r"\s+", "", unicodedata.normalize("NFKC", text))[:_SAMPLE_CHARS]


def identity_terms(text: str) -> frozenset[str]:
    s = unicodedata.normalize("NFKC", text)
    return frozenset(name for name, pattern in _IDENTITY_TERMS.items() if re.search(pattern, s))


def _same_page(a: Member, b: Member) -> bool:
    if a.content_hash == b.content_hash:
        return True
    x, y = _norm(a.content), _norm(b.content)
    m = difflib.SequenceMatcher(None, x, y, autojunk=False)
    if m.real_quick_ratio() < SIMILAR_RATIO or m.quick_ratio() < SIMILAR_RATIO:
        return False
    ratio = m.ratio()
    if ratio >= SAME_PAGE_RATIO:
        return True
    return ratio >= SIMILAR_RATIO and identity_terms(a.content) == identity_terms(b.content)


def suffixed(key: str, url: str) -> str:
    return f"{key}#{hashlib.sha1(url.encode()).hexdigest()[:6]}"


def _freshness(m: Member) -> tuple[int, int, str, int, str]:
    # 同一頁的多份之間：年度、發布日期越新越好，再來是內容較完整；最後以網址排序，結果與順序無關
    return (
        latest_year(m.title) or 0,
        latest_year(m.content[:_YEAR_CHARS]) or 0,
        m.published_at.isoformat() if m.published_at else "",
        len(m.content),
        "".join(chr(0x10FFFF - ord(c)) for c in m.url),  # 網址小的排前面（max 取最大）
    )


def resolve(key: str, members: list[Member]) -> dict[str, Decision]:
    """決定每個網址推送用的鍵，或被取代不推送。結果只取決於成員本身，與爬取順序無關。"""
    if len(members) == 1:
        return {members[0].url: Decision(key, True)}

    # 1. 幾乎相同的歸成一組（同一頁的多個網址），每組選一份代表
    groups: list[list[Member]] = []
    for m in sorted(members, key=lambda m: m.url):
        for g in groups:
            if any(_same_page(m, o) for o in g):
                g.append(m)
                break
        else:
            groups.append([m])
    reps = [max(g, key=_freshness) for g in groups]
    out: dict[str, Decision] = {}
    for g, rep in zip(groups, reps, strict=True):
        for m in g:
            if m is not rep:
                out[m.url] = Decision(key, False, "duplicate")

    if len(reps) == 1:
        out[reps[0].url] = Decision(key, True)
        return out

    # 2. 每一份都標了年度或期別、而且都不同：同一福利的不同年度（期別），只留最新的。
    #    先看標題（年度＋期別），再看正文的年度
    title_marks = [(latest_year(r.title), period(r.title)) for r in reps]
    content_years = [latest_year(r.content[:_YEAR_CHARS]) for r in reps]
    for marks in (
        [None if m == (None, None) else (m[0] or 0, m[1] or 0) for m in title_marks],
        [None if y is None else (y, 0) for y in content_years],
    ):
        if all(m is not None for m in marks) and len(set(marks)) == len(marks):
            newest = reps[marks.index(max(m for m in marks if m is not None))]
            for r in reps:
                out[r.url] = Decision(key, True) if r is newest else Decision(key, False, "older_version")
            return out

    # 3. 分不出先後：不同的福利。網址最小的保留原本的鍵（減少變動），其他的加上網址的短 hash
    first = min(reps, key=lambda r: r.url)
    for r in reps:
        out[r.url] = Decision(key if r is first else suffixed(key, r.url), True)
    return out
