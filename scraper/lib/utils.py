import re

def parse_to_iso_date(date_str: str) -> str:
    if not date_str:
        return ""

    pattern = r"(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})"
    match = re.search(pattern, date_str)

    if not match:
        return ""

    y, m, d = match.groups()
    year = int(y)
    month = int(m)
    day = int(d)

    if len(y) <= 3:
        year += 1911

    return f"{year:04d}-{month:02d}-{day:02d}"

def parse_to_iso_date(date_str: str) -> str:
    if not date_str:
        return ""
    pattern = r"(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})"
    match = re.search(pattern, date_str)
    if not match:
        return ""
    y, m, d = match.groups()
    year = int(y)
    if len(y) <= 3:
        year += 1911
    return f"{year:04d}-{int(m):02d}-{int(d):02d}"

def clean_text(text: str) -> str:
    if not text:
        return ""

    # 移除換行符與回車符
    text = re.sub(r"[\r\n]+", "", text)

    # 移除連續兩個以上的點（...）
    text = re.sub(r"\.{2,}", "", text)

    # 將多個空白、Tab 或空白字元縮減為單一空格
    text = re.sub(r"\s+", " ", text)

    return text.strip()
