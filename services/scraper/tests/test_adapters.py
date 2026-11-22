import json
from urllib.parse import parse_qs, urlsplit

from conftest import MockWeb, fixture, html

from scraper.adapters import adapter_class, get_adapter
from scraper.adapters.crawl import CmsA, CmsB
from scraper.adapters.opendata import OpenData
from scraper.sites import SiteConfig

KINMEN = "https://social.kinmen.gov.tw"
NTPC = "https://www.sw.ntpc.gov.tw"
KLCG = "https://www.klcg.gov.tw"


def site(**kw: object) -> SiteConfig:
    base = {"id": "t", "city": "金門縣", "adapter": "cms_a", "base_url": KINMEN, "seeds": []}
    return SiteConfig.model_validate(base | kw)


def test_adapter_對應() -> None:
    assert adapter_class("cms_a") is CmsA
    assert adapter_class("cms_b") is CmsB
    assert adapter_class("opendata") is OpenData
    assert adapter_class("custom:klcg").__module__ == "scraper.adapters.custom.klcg"


def test_a族_目錄頁不輸出_子項目全部輸出且帶標題() -> None:
    hub = f"{KINMEN}/cp.aspx?n=C8CDE0088D2E9571"
    web = MockWeb({hub: html(fixture("kinmen/cp_hub.html"))}, default=html(fixture("kinmen/cp_item.html")))
    cfg = site(seeds=[{"url": "/cp.aspx?n=C8CDE0088D2E9571", "label": "老人"}], max_depth=1)
    with web.fetcher() as f:
        items = list(get_adapter(cfg, f).list_items())
    urls = [i.url for i in items]
    assert hub not in urls  # cp.aspx?n=X 顯示的是第一個子項目，輸出會重複
    assert len(urls) == 20 and all("&s=" in u for u in urls)
    assert items[1].title_hint == "中低收入老人生活津貼"
    # 內文頁側邊的分類連結不往下走，避免走出福利專區
    assert not any("Content_List" in r for r in web.requests)


def test_a族_只有一筆資料的列表頁當成內文() -> None:
    url = f"{KINMEN}/Content_List.aspx?n=81A09B86DAF7E6C5"
    web = MockWeb({url: html(fixture("kinmen/list_single.html"))})
    cfg = site(seeds=[{"url": url, "label": "新住民"}])
    with web.fetcher() as f:
        items = list(get_adapter(cfg, f).list_items())
    assert [i.url for i in items] == [url]


def test_只走同一主機_去掉指定參數() -> None:
    cfg = site(seeds=[{"url": "/", "label": "x"}], drop_params=["sms"])
    with MockWeb().fetcher() as f:
        a = get_adapter(cfg, f)
        assert isinstance(a, CmsA)
        assert a.canonical("https://phb.kinmen.gov.tw/cp.aspx?n=1", KINMEN) is None
        assert a.canonical("javascript:void(0)", KINMEN) is None
        assert (
            a.canonical("http://social.kinmen.gov.tw/News_Content.aspx?n=A&sms=B&s=C#top", KINMEN)
            == f"{KINMEN}/News_Content.aspx?n=A&s=C"
        )


def _ntpc_details(page: str) -> set[str]:
    cfg = site(adapter="cms_b", base_url=NTPC, city="新北市", seeds=[{"url": "/", "label": "x"}])
    with MockWeb().fetcher() as f:
        a = get_adapter(cfg, f)
        from selectolax.lexbor import LexborHTMLParser

        return {u for u, _ in a.links(LexborHTMLParser(fixture(page)), NTPC + "/") if a.is_detail(u)}


def test_b族_用_page_參數分頁_沒有新項目就停() -> None:
    list_url = f"{NTPC}/home.jsp?id=bd3ac04bd17eafde"
    web = MockWeb(
        {
            list_url: html(fixture("ntpc/list_p1.html")),
            f"{list_url}&page=2": html(fixture("ntpc/list_p2.html")),
            f"{list_url}&page=3": html(fixture("ntpc/list_p2.html")),  # 超過最後一頁時網站會重複最後一頁
        },
        default=html(fixture("ntpc/detail.html")),
    )
    cfg = site(
        adapter="cms_b",
        base_url=NTPC,
        city="新北市",
        seeds=[{"url": "/home.jsp?id=bd3ac04bd17eafde", "label": "老人福利"}],
        max_depth=0,
        pagination={"param": "page", "max": 10},
    )
    with web.fetcher() as f:
        items = list(get_adapter(cfg, f).list_items())
    expected = _ntpc_details("ntpc/list_p1.html") | _ntpc_details("ntpc/list_p2.html")
    assert {i.url for i in items} == expected
    assert len(expected) > 20
    pages = [parse_qs(urlsplit(r).query).get("page") for r in web.requests if "dataserno" not in r]
    assert ["4"] not in pages  # 第 3 頁沒有新項目，不再往後抓


def test_c族基隆_分類_子列表_內文() -> None:
    web = MockWeb(
        {
            f"{KLCG}/tw/social/2749.html": html(fixture("klcg/category.html")),
            f"{KLCG}/tw/social/2750.html": html(fixture("klcg/list.html")),
        },
        default=lambda url: html(fixture("klcg/detail.html")) if "-" in url.rsplit("/", 1)[-1] else None,
    )
    cfg = site(
        adapter="custom:klcg",
        base_url=KLCG,
        city="基隆市",
        seeds=[{"url": "/tw/social/2749.html", "label": "老人福利"}],
        max_depth=1,
    )
    with web.fetcher() as f:
        adapter = get_adapter(cfg, f)
        items = list(adapter.list_items())
    assert {i.url.rsplit("/", 1)[-1] for i in items} >= {"2750-112778.html", "2750-112783.html"}
    assert all("/tw/social/2750-" in i.url for i in items)
    # 子分類 2751~2756 在這個測試沒有內容（404），記錄成錯誤但不中斷
    assert any("http_404" in e for e in adapter.stats.errors)
    assert not any("/tw/social/2591.html" in r for r in web.requests)  # 不走選單裡的「訊息快報」


def test_開放資料_每筆一個項目_原始欄位保留() -> None:
    data = fixture("taichung/disability.json")
    url = "https://data.example/ds.json"
    web = MockWeb({url: (200, data, "application/octet-stream")})
    cfg = site(
        adapter="opendata",
        base_url="https://data.example",
        city="臺中市",
        datasets=[
            {
                "url": url,
                "label": "身障",
                "page_url": "https://data.gov.tw/dataset/112089",
                "title": "補助名稱",
                "id": "補助流水號",
                "link": "相關連結",
            }
        ],
    )
    with web.fetcher() as f:
        items = list(get_adapter(cfg, f).list_items())
    records = json.loads(data)
    assert len(items) == len(records)
    assert items[0].url == "https://data.gov.tw/dataset/112089#1"
    assert items[0].title_hint == "身心障礙者生活補助費"
    assert items[0].link == "https://www.society.taichung.gov.tw/461728/post"
    assert items[0].fields and items[0].fields["應備文件"].startswith("申請人")


def test_開放資料_格式錯誤記錄成錯誤() -> None:
    url = "https://data.example/ds.json"
    web = MockWeb({url: (200, "<html>維護中</html>", "text/html")})
    cfg = site(
        adapter="opendata",
        base_url="https://data.example",
        datasets=[{"url": url, "label": "x", "page_url": "https://data.example/p", "title": "名稱"}],
    )
    with web.fetcher() as f:
        a = get_adapter(cfg, f)
        assert list(a.list_items()) == []
    assert a.stats.errors and a.stats.errors[0].startswith("bad_json")


def test_分頁有額外參數時從第1頁重抓() -> None:
    list_url = f"{KLCG}/tw/social/2797.html"

    def page(n: int) -> tuple[int, str, str]:
        links = "".join(f'<a href="/tw/social/2797-{n * 100 + i}.html">項目{n}-{i}</a>' for i in range(3))
        return html(f'<div class="center_block">{links}</div>')

    web = MockWeb(
        {
            list_url: page(0),  # 網站預設每頁 10 筆的第 1 頁
            f"{list_url}?nowPage=1&pageSize=40": page(1),
            f"{list_url}?nowPage=2&pageSize=40": page(2),
            f"{list_url}?nowPage=3&pageSize=40": page(2),
        },
        default=lambda url: html("<div class='center_block'><p>內文</p></div>") if "-" in url else None,
    )
    cfg = site(
        adapter="custom:klcg",
        base_url=KLCG,
        seeds=[{"url": "/tw/social/2797.html", "label": "x"}],
        pagination={"param": "nowPage", "max": 10, "extra": {"pageSize": "40"}},
    )
    with web.fetcher() as f:
        items = list(get_adapter(cfg, f).list_items())
    assert len(items) == 9  # 預設第 1 頁 3 筆 + pageSize=40 的第 1、2 頁各 3 筆
    assert f"{list_url}?nowPage=4&pageSize=40" not in web.requests


def test_extra_hosts_只收內文頁() -> None:
    cfg = site(
        adapter="cms_b",
        base_url=NTPC,
        seeds=[{"url": "/", "label": "x"}],
        extra_hosts=["service.ntpc.gov.tw"],
        detail=r"(dataserno=[0-9a-f]{32}|service\.ntpc\.gov\.tw/eservice/CaseData\.action\?itemId=\d+)$",
    )
    with MockWeb().fetcher() as f:
        a = get_adapter(cfg, f)
        assert isinstance(a, CmsB)
        svc = a.canonical("https://service.ntpc.gov.tw/eservice/CaseData.action?itemId=110019", NTPC)
        assert svc == "https://service.ntpc.gov.tw/eservice/CaseData.action?itemId=110019"
        assert a.is_detail(svc)
        assert not a.is_list("https://service.ntpc.gov.tw/home.jsp?id=0123456789abcdef")
        assert a.canonical("https://other.ntpc.gov.tw/x", NTPC) is None


def test_exclude_urls_整個分類不抓() -> None:
    web = MockWeb(
        {
            f"{KLCG}/tw/social/2749.html": html(fixture("klcg/category.html")),
            f"{KLCG}/tw/social/2750.html": html(fixture("klcg/list.html")),
        },
        default=lambda url: html(fixture("klcg/detail.html")) if "-" in url.rsplit("/", 1)[-1] else None,
    )
    cfg = site(
        adapter="custom:klcg",
        base_url=KLCG,
        seeds=[{"url": "/tw/social/2749.html", "label": "老人福利"}],
        exclude_urls=[r"/tw/social/(2750|2755)(-\d+)?\.html$"],
    )
    with web.fetcher() as f:
        assert list(get_adapter(cfg, f).list_items()) == []
    assert not any("/2750" in r or "/2755" in r for r in web.requests)


def test_開放資料_CSV_去掉BOM_欄位改中文名稱() -> None:
    from scraper.adapters.opendata import parse_records

    # 臺南的 CSV：檔頭有兩個 BOM（utf-8-sig 只會去掉第一個）
    raw = "﻿﻿補助流水號,補助名稱\n1,低收入戶\n".encode()
    assert parse_records(raw, "csv") == [{"補助流水號": "1", "補助名稱": "低收入戶"}]

    url = "https://data.example/ty.json"
    body = json.dumps([{"policyName": "身心障礙者生活補助", "eligibilityCriteria": "設籍本市"}], ensure_ascii=False)
    web = MockWeb({url: (200, body, "application/json")})
    cfg = site(
        adapter="opendata",
        base_url="https://data.example",
        datasets=[
            {
                "url": url,
                "label": "x",
                "page_url": "https://data.gov.tw/dataset/26032",
                "title": "policyName",
                "id": "policyName",
                "labels": {"policyName": "福利名稱", "eligibilityCriteria": "申請資格"},
            }
        ],
    )
    with web.fetcher() as f:
        [item] = list(get_adapter(cfg, f).list_items())
    assert item.title_hint == "身心障礙者生活補助"
    assert item.url == "https://data.gov.tw/dataset/26032#身心障礙者生活補助"
    assert item.fields == {"福利名稱": "身心障礙者生活補助", "申請資格": "設籍本市"}


def test_A族數字參數的網址規則() -> None:
    cfg = site(base_url="https://sab.tycg.gov.tw", seeds=[{"url": "/cl.aspx?n=7322", "label": "x"}])
    with MockWeb().fetcher() as f:
        a = get_adapter(cfg, f)
        assert isinstance(a, CmsA)
        for u in ["/cl.aspx?n=7322", "/News.aspx?n=1101&sms=9555", "/Content_List.aspx?n=09B2CDA681C47C09"]:
            assert a.is_list("https://sab.tycg.gov.tw" + u), u
        for u in ["/cp.aspx?n=385", "/cp.aspx?n=385&s=12", "/News_Content.aspx?n=1101&s=934324&sms=9555"]:
            assert a.is_detail("https://sab.tycg.gov.tw" + u), u
        # 分頁連結不是新的列表
        assert not a.is_list("https://sab.tycg.gov.tw/News.aspx?n=1101&sms=9555&page=2&PageSize=20")


def test_頁數上限() -> None:
    hub = f"{KINMEN}/cp.aspx?n=C8CDE0088D2E9571"
    web = MockWeb({hub: html(fixture("kinmen/cp_hub.html"))}, default=html(fixture("kinmen/cp_item.html")))
    cfg = site(seeds=[{"url": "/cp.aspx?n=C8CDE0088D2E9571", "label": "x"}], max_pages=5)
    with web.fetcher() as f:
        a = get_adapter(cfg, f)
        items = list(a.list_items())
    assert a.stats.pages == 5 and len(items) == 4
    assert any(e.startswith("max_pages 5") for e in a.stats.errors)
