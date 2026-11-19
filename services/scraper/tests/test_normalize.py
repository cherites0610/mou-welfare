import pytest

from scraper.normalize import content_hash, program_key, program_name


@pytest.mark.parametrize(
    ("a", "b"),
    [
        # 跨年度的同一福利要落在同一個鍵（docs/scraper.md §6.5）
        ("115年度住宿式服務機構使用者補助方案", "116年度住宿式服務機構使用者補助方案"),
        ("【公告】115年婦女生育補助申請須知", "婦女生育補助"),
        ("中低收入老人生活津貼申請", "中低收入老人生活津貼"),
        ("新北市政府114至115年度辦理低收入戶老人安置補助計畫", "新北市政府116至117年度辦理低收入戶老人安置補助計畫"),
        ("金門縣政府辦理老人收容安置補助", "辦理老人收容安置補助"),
    ],
)
def test_同一福利同一個鍵(a: str, b: str) -> None:
    assert program_key("x", a) == program_key("x", b)


@pytest.mark.parametrize(
    ("title", "expected"),
    [
        ("金門縣民敬老卡", "金門縣民敬老卡"),  # 縣民是名稱的一部分
        ("115年「基隆市長青學苑第44期」接駁專車啟動", "長青學苑接駁專車啟動"),  # 「」內是名稱，不能整段刪掉
        ("116年「基隆市老人及身心障礙者餐飲服務補助（金齡食堂）計畫」第一階段開放徵件", "老人及身心障礙者餐飲服務補助"),
    ],
)
def test_福利名稱正規化(title: str, expected: str) -> None:
    assert program_name(title) == expected


def test_不同福利不同鍵() -> None:
    assert program_key("x", "中低收入老人生活津貼") != program_key("x", "中低收入老人特別照顧津貼")


def test_鍵包含站點() -> None:
    assert program_key("kinmen", "老人假牙補助") == "kinmen:老人假牙補助"


def test_hash_忽略空白差異_附件順序() -> None:
    assert content_hash("a  b\n c", ["u2", "u1"]) == content_hash("a b c", ["u1", "u2"])
    assert content_hash("a b c") != content_hash("a b d")
    assert content_hash("x").startswith("sha256:") and len(content_hash("x")) == 71
