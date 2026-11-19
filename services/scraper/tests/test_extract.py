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


def test_連結文字去掉開啟新視窗() -> None:
    assert dedupe_halves("申請天然災害災害救助(開啟新視窗)") == "申請天然災害災害救助"
    assert dedupe_halves("身心障礙者租賃房屋租金補助(另開新視窗)") == "身心障礙者租賃房屋租金補助"


def test_正文去掉無障礙定位文字與多餘空白() -> None:
    md = clean_markdown("中央內容區塊\n\n特殊境遇家庭扶助\n-                     \t\t網頁維護：社會局")
    assert md == "特殊境遇家庭扶助\n- 網頁維護：社會局"
