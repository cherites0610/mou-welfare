import pytest

from scraper.filter.rules import judge_title


@pytest.mark.parametrize(
    "title",
    [
        "115年度第3次兒少福利促進委員會會議紀錄",
        "【公開徵選補助單位】116年度花蓮縣設置少年社區服務據點計畫",
        "116年度補助民間團體辦理社會福利服務計畫公告",
        "115年度社會福利補助案件核銷注意事項",
        "社會救助金專戶公開徵信",
        "身心障礙者臨時照顧服務採購案決標公告",
    ],
)
def test_雜訊標題被排除(title: str) -> None:
    assert judge_title(title) == "exclude"


@pytest.mark.parametrize(
    "title",
    [
        "中低收入老人生活津貼",
        "身心障礙者生活補助",
        "低收入戶醫療費用補助",
        "婦女生育補助申請須知",
        "弱勢兒童及少年生活扶助",
    ],
)
def test_福利標題不能被誤殺(title: str) -> None:
    assert judge_title(title) == "boost"


def test_中性標題() -> None:
    assert judge_title("社會福利服務中心簡介") == "neutral"


def test_站點自訂排除字() -> None:
    assert judge_title("長青學苑招生簡章", extra_exclude=("招生",)) == "exclude"
