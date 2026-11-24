from datetime import date

import pytest
from conftest import fixture

from scraper.extract.dates import find_published_date
from scraper.extract.html import clean_markdown, clean_page_title, dedupe_halves, extract_html
from scraper.normalize import content_hash


def test_a族內文_標題用列表連結文字_日期為民國年() -> None:
    ext = extract_html(
        fixture("kinmen/cp_item.html"),
        "https://social.kinmen.gov.tw/cp.aspx?n=C8CDE0088D2E9571&s=535E01AC52EFB5A7",
        hint="中低收入老人生活津貼 中低收入老人生活津貼",
        body="div.page-content, div.area-editor, div.file-download-multiple",
    )
    assert ext.title == "中低收入老人生活津貼"
    assert ext.published_at == date(2024, 2, 22)  # 113-02-22
    assert "補助對象" in ext.content_md
    assert "| 金額 |" in ext.content_md  # 表格保留成 Markdown


def test_a族附件在頁尾區塊_名稱去掉格式與大小() -> None:
    ext = extract_html(
        fixture("kinmen/cp_hub.html"),
        "https://social.kinmen.gov.tw/cp.aspx?n=C8CDE0088D2E9571",
        body="div.page-content, div.area-editor, div.file-download-multiple",
    )
    names = {a.name for a in ext.attachments}
    assert names and all("另開新視窗" not in n and "KB" not in n for n in names)
    assert all(a.url.startswith("https://ws.kinmen.gov.tw/Download.ashx") for a in ext.attachments)


def test_c族基隆_標題取頁面標題最後一段_附件與發布日期() -> None:
    ext = extract_html(
        fixture("klcg/detail.html"), "https://www.klcg.gov.tw/tw/social/2750-112778.html", body="div.center_block"
    )
    assert ext.title == "中低收入老人生活津貼申請"
    assert ext.published_at == date(2017, 12, 1)  # 用發布日期，不用最後更新時間
    assert [a.url.rsplit(".", 1)[-1] for a in ext.attachments] == ["pdf", "odt"]
    assert ext.attachments[0].name == "基隆市中低收入老人生活津貼審核作業辦法"
    # 每天都會變的欄位不能進正文，否則每次都被判定為「更新」
    assert "點閱" not in ext.content_md and "最後更新" not in ext.content_md


def test_b族新北內文_日期() -> None:
    url = (
        "https://www.sw.ntpc.gov.tw/home.jsp?id=bd3ac04bd17eafde"
        "&act=be4f48068b2b0031&dataserno=ceb4c57b67737d35bf592e0965c54054"
    )
    ext = extract_html(fixture("ntpc/detail.html"), url, hint="115年度住宿式服務機構使用者補助方案")
    assert ext.title == "115年度住宿式服務機構使用者補助方案"
    assert ext.published_at == date(2026, 9, 16)


def test_只有一筆資料的列表頁_正文在列表區塊外() -> None:
    ext = extract_html(
        fixture("kinmen/list_single.html"),
        "https://social.kinmen.gov.tw/Content_List.aspx?n=81A09B86DAF7E6C5",
        body="div.page-content, div.area-editor, div.file-download-multiple",
    )
    assert ext.title == "金門縣設籍前新住民社會救助計畫"
    assert "補助對象" in ext.content_md and len(ext.content_md) > 1000


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("日期：113-05-02", date(2024, 5, 2)),
        ("發布日期：2017/12/01\n最後更新時間： 2026/11/18", date(2017, 12, 1)),
        ("發佈日期：2026-09-16", date(2026, 9, 16)),
        ("公告日期：115年3月1日", date(2026, 3, 1)),
        ("更新日期：2026-11-18", None),  # 更新日期不算發布日期
        ("日期：113-13-40", None),
        ("沒有日期", None),
    ],
)
def test_發布日期(text: str, expected: date | None) -> None:
    assert find_published_date(text) == expected


def test_頁面標題去掉機關名稱() -> None:
    assert clean_page_title("基隆市政府社會處－經濟扶助－中低收入老人生活津貼申請") == "中低收入老人生活津貼申請"
    assert clean_page_title("老人福利-新北市政府社會局") == "老人福利"


def test_連結文字重複兩次時只取一次() -> None:
    assert dedupe_halves("老人假牙補助 老人假牙補助") == "老人假牙補助"
    assert dedupe_halves("老人 假牙") == "老人 假牙"


def test_瀏覽人次不影響內容hash() -> None:
    a = clean_markdown("申請資格：年滿65歲\n瀏覽人次：1693 人")
    b = clean_markdown("申請資格：年滿65歲\n瀏覽人次：1694 人")
    assert content_hash(a) == content_hash(b)


def test_正文區塊是空的_不能把選單當正文() -> None:
    # 金門「兒童及少年生活扶助」：編輯區沒有內容，trafilatura 退回整頁文字（2026-11 實際跑出的案例）
    from scraper.adapters.crawl import CmsA

    ext = extract_html(
        fixture("kinmen/cp_empty.html"),
        "https://social.kinmen.gov.tw/cp.aspx?n=69B652E4C1464FFE&s=8DEF1A864A97BF84",
        hint="兒童及少年生活扶助",
        body=CmsA.DEFAULTS["body"],
        content=CmsA.DEFAULTS["content"],
    )
    assert "手機版選單" not in ext.content_md and "主題福利服務專區" not in ext.content_md
    assert len(ext.content_md) < 80  # 只剩日期、聯絡人 → 品質關卡會隔離
    assert ext.published_at == date(2024, 1, 26)


def test_A族News_Content頁_正文在area_essay() -> None:
    # 嘉義市（臺南、桃園、宜蘭相同）：News_Content.aspx 的正文在 div.area-essay，不在 div.area-editor。
    # 2026-11-23 排程第一次執行時只抽到「發布單位、上版日期」34 字，嘉義市 49 頁被隔離
    from scraper.adapters.crawl import CmsA

    ext = extract_html(
        fixture("chiayi/news_content.html"),
        "https://social.chiayi.gov.tw/News_Content.aspx?n=1101&s=404270",
        hint="中低收入老人特別照顧津貼",
        body=CmsA.DEFAULTS["body"],
        content=CmsA.DEFAULTS["content"],
    )
    assert len(ext.content_md) > 500
    assert "受理申請地點" in ext.content_md and "請領資格" in ext.content_md
    assert ext.content_md.count("受理申請地點") == 1  # 區塊沒有重複


def test_連結文字去掉開啟新視窗() -> None:
    assert dedupe_halves("申請天然災害災害救助(開啟新視窗)") == "申請天然災害災害救助"
    assert dedupe_halves("身心障礙者租賃房屋租金補助(另開新視窗)") == "身心障礙者租賃房屋租金補助"


def test_正文去掉無障礙定位文字與多餘空白() -> None:
    md = clean_markdown("中央內容區塊\n\n特殊境遇家庭扶助\n-                     \t\t網頁維護：社會局")
    assert md == "特殊境遇家庭扶助\n- 網頁維護：社會局"


def test_去掉Word項目符號與附件名稱的下載字樣() -> None:
    assert (
        clean_markdown("l年滿65歲\nØ申請資格\nline 不受影響\n- l設籍本縣")
        == "年滿65歲\n申請資格\nline 不受影響\n- 設籍本縣"
    )
    from selectolax.lexbor import LexborHTMLParser

    from scraper.extract.html import find_attachments

    doc = LexborHTMLParser('<main><a href="/Upload/a.pdf">下載 申請表.pdf</a></main>')
    assert find_attachments(doc, "https://sa.hl.gov.tw/", None)[0].name == "申請表.pdf"


def test_連結文字去掉清單編號() -> None:
    assert dedupe_halves("1-1彰化縣政府生育補助") == "彰化縣政府生育補助"
    assert dedupe_halves("2-10 身心障礙者生活補助") == "身心障礙者生活補助"
    assert dedupe_halves("1. 敬老優惠措施") == "敬老優惠措施"
    assert dedupe_halves("3、重陽敬老金") == "重陽敬老金"
    assert dedupe_halves("65歲以上老人健保補助") == "65歲以上老人健保補助"
    assert dedupe_halves("115年度「中低收入老人」補助") == "115年度「中低收入老人」補助"


def test_標題編號_數字後接單位時保留() -> None:
    assert dedupe_halves("0-6歲國家一起養") == "0-6歲國家一起養"
    assert dedupe_halves("6. 社福卡") == "社福卡"


def test_有正文區塊設定時_只抽正文區塊() -> None:
    # 花蓮：正文很長時，整頁文字的選單比例不夠高，選單會混進正文（2026-11-22）
    nav = "".join(f'<li><a href="/List_sp/{i}">選單項目{i}</a></li>' for i in range(40))
    body = "<p>補助對象：設籍本縣並已通報主管機關之發展遲緩兒童，得申請早期療育費用補助。</p>" * 6
    html = f'<html><body><ul class="menu">{nav}</ul><div class="edit_box">{body}</div></body></html>'
    ext = extract_html(html, "https://sa.hl.gov.tw/Detail_sp/x", content="div.edit_box")
    assert "選單項目" not in ext.content_md
    assert "早期療育費用補助" in ext.content_md


def test_雜訊行與script() -> None:
    md = clean_markdown("申請資格\n- pdf(557.24 KB) MD5:13ccd48104db857831e70ecac4b18297\n.  .  .  .\n補助內容")
    assert md == "申請資格\n補助內容"
    assert dedupe_halves("移至2-6罹患癌症之兒童及青少年醫療費用補助") == "罹患癌症之兒童及青少年醫療費用補助"
    body = "<p>申請資格：設籍本市並領有身心障礙證明者，可申請監護宣告費用補助。</p>" * 3
    script = '<script>$(function () { $.ajax({url: "x"}) })</script>'
    html = f'<html><body><div class="c">{body}{script}</div></body></html>'
    assert "ajax" not in extract_html(html, "https://x.example/", content="div.c").content_md


def test_正文區塊空白時不退回整頁() -> None:
    # 花蓮：內容只在附件裡的頁面，正文區塊是空的；退回整頁就會得到整個選單
    nav = "".join(f'<li><a href="/List_sp/{i}">選單項目{i}</a></li>' for i in range(40))
    html = f'<html><body><ul>{nav}</ul><p>{"頁尾說明文字。" * 30}</p><div class="edit_box"></div></body></html>'
    assert extract_html(html, "https://sa.hl.gov.tw/Detail_sp/x", content="div.edit_box").content_md == ""


def test_計數器標籤只給螢幕閱讀器時_整個移除() -> None:
    # 彰化：<div class="views"><span class="sr-only">瀏覽人數：</span>4273人</div>，抽取後只剩「4273人」，
    # 每次爬取 hash 都不同（2026-11-23 兩次執行間隔 45 分鐘，33 頁有 23 頁被當成更新）
    def page(views: int) -> str:
        return (
            '<html><body><div class="con"><h3>育兒津貼</h3>'
            '<div class="post-date">承辦單位 兒童及少年福利科</div>'
            f'<div class="views"><i class="fa fa-eye"></i><span class="sr-only">瀏覽人數：</span>{views}人</div>'
            "<p>補助對象：實際年齡未滿2歲的我國籍兒童，每月補助5,000元，名額 50人，請向戶籍地公所申請。</p>"
            "<p>應備文件：申請表、戶口名簿影本、申請人存摺封面影本，以及其他經公所認定需要的證明文件。</p>"
            "</div></body></html>"
        )

    # 彰化沒有設定正文區塊（整頁抽取）
    a = extract_html(page(4273), "https://www.chcg.gov.tw/x")
    b = extract_html(page(4274), "https://www.chcg.gov.tw/x")
    assert a.content_md == b.content_md
    assert "4273" not in a.content_md
    assert "名額 50人" in a.content_md


def test_臺北點閱數在正文區塊裡_整個移除() -> None:
    # 臺北：頁尾的 div.list-text.detail.bottom-detail 也符合 A 族的正文區塊；「點閱數：」標籤抽取後不見，
    # 只剩「2051」，每次瀏覽加一（2026-11-24 連抓兩次 2050 → 2051）
    def page(hits: int) -> str:
        return (
            '<html><body><div class="area-editor user-edit"><p>'
            + "身心障礙者財產信託說明與申請方式。" * 6
            + "</p></div>"
            '<div class="list-text detail bottom-detail"><ul>'
            f'<li><span><i class="mark">點閱數：</i><span id="hitcount">{hits}</span></span></li>'
            '<li><span><i class="mark">資料更新：</i>115-01-06 15:58</span></li></ul></div></body></html>'
        )

    content = "div.list-text.detail, div.area-editor.user-edit"
    a = extract_html(page(2050), "https://dosw.gov.taipei/cp.aspx?n=X", content=content)
    b = extract_html(page(2051), "https://dosw.gov.taipei/cp.aspx?n=X", content=content)
    assert a.content_md == b.content_md
    assert "2050" not in a.content_md and "115-01-06" in a.content_md


def test_頁首的今天日期與時間_整個移除() -> None:
    # 新北：正文區塊抓不到、退回整頁抽取的頁面，頁首時鐘會被收進正文，每次爬取都不同（2026-11-24 3 頁）
    def page(clock: str) -> str:
        return (
            f'<html><body><div class="calendar"><p>115 - 11 - 24</p><p>{clock}</p></div>'
            "<main><h1>社區照顧關懷據點</h1><p>"
            + "服務時間為每月第一週的星期二 8:00-12:00，請先電話預約。"
            * 4
            + "</p>"
            "</main></body></html>"
        )

    a = extract_html(page("星期二&nbsp;07 : 31"), "https://www.sw.ntpc.gov.tw/x").content_md
    b = extract_html(page("星期二&nbsp;08 : 30"), "https://www.sw.ntpc.gov.tw/x").content_md
    assert a == b
    assert "07 : 31" not in a and "115 - 11 - 24" not in a
    assert "星期二 8:00-12:00" in a  # 正文裡的時間不受影響
