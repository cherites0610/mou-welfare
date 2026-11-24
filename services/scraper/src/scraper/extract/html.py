"""HTML 內文頁 → 標題、正文 Markdown、發布日期、附件連結。"""

import re
from dataclasses import dataclass, field
from datetime import date
from urllib.parse import urljoin

import trafilatura
from selectolax.lexbor import LexborHTMLParser, LexborNode

from scraper.extract.dates import find_published_date

MIN_BODY_CHARS = 80

# 每次瀏覽都會變的欄位：留著會讓 content_hash 每天不同，被誤判成「更新」
_VOLATILE_LINE = re.compile(r"(點閱|瀏覽|人次|最後更新|更新日期|更新時間|友善列印|回上一頁|:::)")
# 無障礙用的定位文字，不是正文
_ACCESSKEY_LINE = re.compile(r"^(?:#+\s*)?(?:中央內容區塊|跳到主要內容區塊?|主要內容區)$")
# 清單編號前綴：彰化「1-1彰化縣政府生育補助」、臺南「1. 敬老優惠措施」；要有 - 或 . 、 分隔才去掉，避免誤刪「65歲以上…」
_LIST_NUMBER = re.compile(r"^\d{1,2}(?:(?:-\d{1,2})+\s*|[.、．]\s*)(?![歲年月日週個人元次%])(?=[一-鿿【「(（])")
_WORD_BULLET = re.compile(r"^((?:[-*]\s*)?)[lnØ§üvq]\s?(?=[\u4e00-\u9fff（(「])")
# 不是正文的行：檔案清單的 MD5、PDF 目錄頁轉出的整排點點
_NOISE_LINE = re.compile(r"MD5\s*[:：]\s*[0-9a-fA-F]{32}|^[\s.·…‧•\-_]{3,}$")
# 連結 title 屬性常見的前綴：彰化「移至2-6罹患癌症…」
_LINK_PREFIX = re.compile(r"^(?:移至|前往|連結至|開啟)\s*")
_NEW_WINDOW = re.compile(r"\s*[(（\[［](?:另開|開啟)新視窗[)）\]］]")
_FILE_LINK = re.compile(
    r"(?i)(\.(pdf|odt|ods|odp|docx?|xlsx?|pptx?)(?:$|[?#&])|download\.ashx|getfile\.aspx|downdoc|/attachment/|/download/)"
)
_FILE_EXT = r"(?:pdf|odt|ods|odp|docx?|xlsx?|pptx?)"
_FILE_NAME_NOISE = [
    re.compile(rf"^{_FILE_EXT}\s+", re.I),  # A 族：「docx 開立專戶申請書(14.29 KB).docx[另開新視窗]」
    re.compile(r"[\[［(（]另開新視窗[\]］)）]"),
    re.compile(r"^下載\s*"),  # 花蓮：「下載 申請表.pdf」
    re.compile(r"[(（]\s*[\d.]+\s*[KMG]?B\s*[)）]", re.I),
    re.compile(rf"[（(](?:{_FILE_EXT}|檔案下載|、)+[)）]\s*$", re.I),  # 基隆：「(PDF、檔案下載)」
]
_TITLE_SEP = re.compile(r"\s*[-－|｜_]\s*")
_SITE_WORDS = re.compile(r"(政府|社會處|社會局|全球資訊網|首頁)")


@dataclass(frozen=True)
class AttachmentLink:
    name: str
    url: str


@dataclass(frozen=True)
class Extracted:
    title: str
    content_md: str
    published_at: date | None
    attachments: list[AttachmentLink] = field(default_factory=list)


def clean_text(text: str) -> str:
    text = re.sub(r"[ \t　\xa0]+", " ", text)
    return text.strip()


def dedupe_halves(text: str) -> str:
    """A 族網站的連結文字常是「標題 標題」（畫面文字 + 給報讀軟體的隱藏文字）；也去掉「(開啟新視窗)」。"""
    text = clean_text(_LIST_NUMBER.sub("", _LINK_PREFIX.sub("", clean_text(_NEW_WINDOW.sub("", text)))))
    half, rest = divmod(len(text), 2)
    if rest == 1 and text[half] == " " and text[:half] == text[half + 1 :]:
        return text[:half]
    return text


def clean_page_title(raw: str) -> str:
    """「基隆市政府社會處－經濟扶助－中低收入老人生活津貼申請」→「中低收入老人生活津貼申請」。"""
    parts = [p for p in _TITLE_SEP.split(clean_text(raw)) if p]
    kept = [p for p in parts if not _SITE_WORDS.search(p)]
    return kept[-1] if kept else clean_text(raw)


def _meta(doc: LexborHTMLParser, prop: str) -> str | None:
    node = doc.css_first(f'meta[property="{prop}"]')
    value = node.attributes.get("content") if node else None
    return clean_text(value) if value else None


def pick_title(doc: LexborHTMLParser, hint: str | None) -> str:
    """列表上的連結文字最準（A 族的 og:title 只有分類名稱），其次是 og:title、<title>。"""
    if hint and len(dedupe_halves(hint)) >= 4:
        return dedupe_halves(hint)
    og = _meta(doc, "og:title")
    title_node = doc.css_first("title")
    page_title = clean_page_title(title_node.text()) if title_node else ""
    # og:title 比 <title> 短很多時，通常只是分類名稱
    if og and len(og) >= 4 and not (page_title and og in page_title and len(og) < len(page_title) // 2):
        return dedupe_halves(clean_page_title(og))
    return dedupe_halves(page_title or og or "")


def clean_markdown(md: str) -> str:
    lines = [re.sub(r"[ \t\u3000\xa0]+", " ", ln).strip() for ln in md.splitlines()]
    lines = [
        ln
        for ln in lines
        if not _VOLATILE_LINE.search(ln) and not _ACCESSKEY_LINE.match(ln) and not _NOISE_LINE.search(ln)
    ]
    # 從 Word 貼上的項目符號（Wingdings）會變成英文字母：「l年滿65歲」「Ø申請資格」
    lines = [_WORD_BULLET.sub(r"\1", ln) for ln in lines]
    text = "\n".join(lines)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _body_nodes(doc: LexborHTMLParser, body: str | None) -> list[LexborNode]:
    if body:
        return doc.css(body)
    return doc.css("main, article")


def find_attachments(doc: LexborHTMLParser, base_url: str, body: str | None) -> list[AttachmentLink]:
    found: dict[str, AttachmentLink] = {}
    for node in _body_nodes(doc, body):
        for a in node.css("a[href]"):
            href = (a.attributes.get("href") or "").strip()
            if not href or href.startswith(("javascript:", "#", "mailto:")) or not _FILE_LINK.search(href):
                continue
            url = urljoin(base_url, href)
            name = clean_text(a.attributes.get("title") or "") or clean_text(a.text())
            for noise in _FILE_NAME_NOISE:
                name = noise.sub("", name).strip()
            found.setdefault(url, AttachmentLink(name=name or url.rsplit("/", 1)[-1], url=url))
    return list(found.values())


def navigation_ratio(doc: LexborHTMLParser, md: str) -> float:
    """輸出裡有多少行剛好是頁面上某個連結的文字。比例高代表抓到的是選單，不是正文。"""
    link_texts = {clean_text(a.text()) for a in doc.css("a")}
    link_texts.discard("")
    lines = [clean_text(ln.lstrip("-*#|> ")) for ln in md.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines:
        return 0.0
    return sum(ln in link_texts for ln in lines) / len(lines)


MAX_NAVIGATION_RATIO = 0.5


def _trafilatura(html: str, url: str) -> str:
    md = trafilatura.extract(
        html, url=url, output_format="markdown", include_tables=True, include_links=False, include_images=False
    )
    return md or ""


# 抽取後標籤不見、只剩數字的計數器，normalize._VOLATILE_RE 認不出來：
# - 彰化：<span class="sr-only">瀏覽人數：</span>4273人（標籤只給螢幕閱讀器）
# - 臺北：<i class="mark">點閱數：</i><span id="hitcount">2051</span>（在正文區塊 div.list-text.detail 裡，
#   抽取後只剩「2051」；每次瀏覽都會加一，連我們自己抓的那次也算）
_COUNTER_LABEL = re.compile(r"^\s*(?:累計)?(?:瀏覽|點閱|觀看|閱覽|下載)\s*(?:人數|人次|次數|數)\s*[:：]?\s*$")
_COUNTER_LABEL_NODES = ".sr-only, .visually-hidden, .mark"
_COUNTER_VALUE_NODES = '[id*="hitcount"], [class*="hitcount"]'


# 頁首的「今天日期＋現在時間」（新北：<div class="calendar"><p>115 - 11 - 24</p><p>星期二 08 : 35</p></div>）。
# 正文區塊抓不到、退回整頁抽取時會被收進正文，每次爬取都不同。整個元素只有日期與時間才算，
# 正文裡的「每月第一週的星期二8:00-12:00」不受影響
_CLOCK = re.compile(
    r"^\s*(?:\d{2,4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}\s*日?\s*)?"
    r"(?:\(?(?:星期|週|周)[一二三四五六日天]\)?)\s*\d{1,2}\s*:\s*\d{2}(?:\s*:\s*\d{2})?\s*$"
)


def drop_counters(doc: LexborHTMLParser) -> int:
    """移除瀏覽／點閱計數器與頁首時鐘（整個元素拿掉），否則每次爬取 hash 都不同、後端每次重做結構化。"""
    dropped = 0
    for label in doc.css(_COUNTER_LABEL_NODES):
        if _COUNTER_LABEL.match(label.text() or ""):
            (label.parent or label).decompose()
            dropped += 1
    for node in doc.css(_COUNTER_VALUE_NODES):
        node.decompose()
        dropped += 1
    # 先找出全部再移除（移除後的節點不能再碰）；外層和裡面都符合時只拿掉外層
    clocks = [n for n in doc.css("div, p, span, li, time") if _CLOCK.match(n.text(separator=" ") or "")]
    ids = {n.mem_id for n in clocks}
    for node in [n for n in clocks if not ids & _ancestors(n)]:
        node.decompose()
        dropped += 1
    return dropped


def _ancestors(node: LexborNode) -> set[int]:
    out: set[int] = set()
    parent = node.parent
    while parent is not None:
        out.add(parent.mem_id)
        parent = parent.parent
    return out


def extract_html(
    html: str, url: str, *, hint: str | None = None, body: str | None = None, content: str | None = None
) -> Extracted:
    """`body`：找附件的區塊；`content`：正文區塊，trafilatura 失敗時的備援（沒有就用 body）。"""
    doc = LexborHTMLParser(html)
    # 正文區塊裡的 <script> 會被當成文字（臺北：點閱數的 $.ajax 出現在正文）
    for node in doc.css("script, style, noscript"):
        node.decompose()
    # 有移除計數器時，整頁抽取也要用移除後的內容；沒有時沿用原始 HTML，其他站的抽取結果（與 hash）不變
    page = doc.html or html if drop_counters(doc) else html
    text = ""
    region_nodes = doc.css(content) if content else []
    if region_nodes:
        # 站點設定了正文區塊、而且頁面上有這個區塊：只抽這個區塊，不退回整頁。
        # 整頁文字在正文很長時選單比例不夠高、在正文空白時就是整個選單（花蓮），兩種都擋不乾淨；
        # 正文太短時交給流程併入附件文字或隔離。
        region = "".join(n.html or "" for n in region_nodes)
        text = clean_markdown(_trafilatura(f"<html><body><article>{region}</article></body></html>", url))
    else:
        text = clean_markdown(_trafilatura(page, url))
    # 正文區塊是空的時，trafilatura 會退回整頁文字（選單、頁尾），這種結果不能用
    if navigation_ratio(doc, text) > MAX_NAVIGATION_RATIO:
        text = ""
    if len(text) < MIN_BODY_CHARS:
        fallback = "\n\n".join(n.text(separator="\n", strip=True) for n in _body_nodes(doc, content or body))
        fallback = clean_markdown(fallback)
        if len(fallback) > len(text) and navigation_ratio(doc, fallback) <= MAX_NAVIGATION_RATIO:
            text = fallback
    page_text = (doc.body.text(separator="\n") if doc.body else "") or text
    return Extracted(
        title=pick_title(doc, hint),
        content_md=text,
        published_at=find_published_date(text) or find_published_date(page_text),
        attachments=find_attachments(doc, url, body),
    )
