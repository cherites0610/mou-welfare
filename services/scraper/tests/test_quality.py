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
