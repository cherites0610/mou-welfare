from datetime import date

import pytest

from scraper.quality import Candidate, quality_issues

TODAY = date(2026, 11, 18)
GOOD = Candidate(
    title="中低收入老人生活津貼", content="申請資格：" + "年滿65歲並設籍本縣。" * 10, published_at=date(2026, 3, 1)
)


def test_合格資料沒有問題() -> None:
    assert quality_issues(GOOD, TODAY) == []


@pytest.mark.parametrize(
    ("patch", "issue"),
    [
        ({"title": ""}, "title_too_short"),  # v1：selector 失效時標題為空仍被推送
        ({"title": "   "}, "title_too_short"),
        ({"content": "請參閱附件"}, "content_too_short"),
        ({"published_at": date(2028, 1, 1)}, "date_in_far_future"),
    ],
)
def test_不合格資料被隔離(patch: dict[str, object], issue: str) -> None:
    c = Candidate(**{**GOOD.__dict__, **patch})  # type: ignore[arg-type]
    assert issue in quality_issues(c, TODAY)


@pytest.mark.parametrize(
    "content",
    [
        "抱歉！請您再重新檢視輸入的網址是否正確。\n\n您也可以回到上一頁或首頁。\n\nSorry. Please check one more time "
        "that your website address has been entered correctly.",
        "查無資料，請重新查詢。" * 10,
    ],
)
def test_找不到網頁的錯誤頁被隔離(content: str) -> None:
    # 金門：失效的 cp.aspx 回 200 與錯誤訊息（2026-11 實際跑出的案例）
    c = Candidate(**{**GOOD.__dict__, "content": content})  # type: ignore[arg-type]
    assert "error_page" in quality_issues(c, TODAY)


def test_長正文提到查無資料不算錯誤頁() -> None:
    c = Candidate(**{**GOOD.__dict__, "content": "若戶政系統查無資料，請檢附戶口名簿影本。" + "申請資格說明。" * 100})  # type: ignore[arg-type]
    assert quality_issues(c, TODAY) == []
