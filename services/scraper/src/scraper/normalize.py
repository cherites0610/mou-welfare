"""跨年度合併鍵與內容 hash（docs/scraper.md §6.4、§6.5）。"""

import hashlib
import re
import unicodedata

CITIES = (
    "臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市",
    "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣",
    "臺東縣", "澎湖縣", "金門縣", "連江縣",
)  # fmt: skip
_CITY_NAMES = "|".join(sorted({*CITIES, *(c.replace("臺", "台") for c in CITIES)}, key=len, reverse=True))
# 「金門縣政府辦理…」去掉整個機關名；「金門縣民敬老卡」的「縣民」是福利名稱的一部分，保留
_CITY_RE = re.compile(rf"(?:{_CITY_NAMES}|本市|本縣)(?:政府)?(?!民)|^[市縣]府")
_YEAR_RE = re.compile(
    r"(?:(?:民國)?\d{2,3}|\d{4})\s*(?:[至~～\-－]\s*(?:\d{2,3}|\d{4})\s*)?年度?"  # 115年度、114至115年、2026年
    r"|(?:第\s*[\d一二三四五六七八九十]+\s*[期次梯階段]+)"  # 第44期、第一階段
)
# 只去掉短標註：【公告】《公告》（金齡食堂）；「」裡通常是福利名稱本身，不能去掉
_BRACKET_RE = re.compile(r"【[^】]{0,8}】|\[[^\]]{0,8}\]|《[^》]{0,4}》|[(（][^)）]{0,8}[)）]")
_PUNCT_RE = re.compile(r"[\s\-－_:：、，,。．.·・!！?？/／\"'“”‘’「」『』]+")
_PREFIX_RE = re.compile(r"^(?:公告|轉知|轉貼|最新消息|訊息)+")
# 行政用語：去掉後同一福利不同年度的公告才會落在同一個鍵
_SUFFIX_RE = re.compile(
    r"(?:開放徵件|開放申請|受理申請|開始受理|實施計畫|實施要點|作業要點|申請須知|申請|公告|簡章|計畫)+$"
)


def program_name(title: str) -> str:
    """福利名稱的正規形式：去掉年度、縣市名、括號標註和常見的行政用語。"""
    s = unicodedata.normalize("NFKC", title)
    s = _BRACKET_RE.sub("", s)
    s = _YEAR_RE.sub("", s)
    s = _CITY_RE.sub("", s)
    s = _PUNCT_RE.sub("", s)
    s = _PREFIX_RE.sub("", s)
    stripped = _SUFFIX_RE.sub("", s)
    return stripped if len(stripped) >= 2 else s


def program_key(site_id: str, title: str) -> str:
    name = program_name(title) or unicodedata.normalize("NFKC", title).strip()
    return f"{site_id}:{name}"


def content_hash(content: str, attachment_urls: list[str] | None = None) -> str:
    """正文（空白正規化後）加上附件網址的 sha256。附件內容不列入，避免為了比對而每次重新下載附件。"""
    normalized = re.sub(r"\s+", " ", unicodedata.normalize("NFKC", content)).strip()
    payload = normalized + "\n" + "\n".join(sorted(attachment_urls or []))
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
