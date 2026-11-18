import re

from scraper.sites import load_sites


def test_所有站點設定都能載入() -> None:
    sites = load_sites()
    assert "kinmen" in sites


def test_站點的連結規則是合法的正規表示式() -> None:
    for s in load_sites().values():
        for pattern in (s.follow, s.detail):
            if pattern:
                re.compile(pattern)
