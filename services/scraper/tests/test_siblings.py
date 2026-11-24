"""同一站裡 program_key 相同的網址（siblings.py，docs/scraper.md §6.5）"""

from datetime import date

from scraper.siblings import Member, identity_terms, latest_year, period, resolve, suffixed

KEY = "kinmen:申請社會救助專戶"
BODY = "（一）補助對象：本縣列冊{who}之民眾存款帳戶遭扣押或強制執行者，有需求者可先洽各鄉鎮公所社會課諮詢。" + (
    "（二）申請方式：備妥下列文件，於補助發放前30日向戶籍所在地鄉（鎮）公所提出申請。" * 4
)


def m(
    url: str, content: str, title: str = "申請社會救助專戶", h: str | None = None, published: date | None = None
) -> Member:
    return Member(url, h or f"sha256:{hash(content)}", title, content, published)


def test_只有一個網址_照原本的鍵() -> None:
    assert resolve(KEY, [m("https://a/1", "x")])["https://a/1"].key == KEY


def test_同一頁的多個網址_只留一份() -> None:
    a = m("https://a/2", "相同內容" * 50, h="sha256:same")
    b = m("https://a/1", "相同內容" * 50, h="sha256:same")
    d = resolve(KEY, [a, b])
    assert [d[u.url].keep for u in (a, b)].count(True) == 1
    assert {d[u.url].reason for u in (a, b)} == {"", "duplicate"}


def test_只差排版或幾句修訂_算同一頁_留內容較完整的() -> None:
    old = m("https://a/1", BODY.format(who="中低收入老人"))
    new = m("https://a/2", BODY.format(who="中低收入老人") + "未入獄服刑、因案羈押或依法拘禁者。")
    d = resolve(KEY, [old, new])
    assert d[new.url].keep and not d[old.url].keep


def test_文字很像但身分不同_是不同的福利_拆成不同的鍵() -> None:
    # 金門：只差「領有身心障礙生活補助」與「低收入戶及中低收入戶」，相似度約 92.5%
    a = m("https://a/1", BODY.format(who="領有身心障礙生活補助"))
    b = m("https://a/2", BODY.format(who="低收入戶及中低收入戶"))
    d = resolve(KEY, [b, a])
    assert d[a.url].key == KEY  # 網址最小的保留原本的鍵
    assert d[b.url].key == suffixed(KEY, b.url) and d[b.url].keep


def test_不同年度_只留最新的() -> None:
    plans = {
        113: "上午課程在花蓮市。" * 6,
        115: "分成三個場次，地點在吉安鄉與玉里鎮。" * 5,
        114: "線上課程，結束後線上測驗。" * 6,
    }
    v = [
        m(f"https://a/{y}", f"{y}年度研習計畫。{plans[y]}", title=f"{y}年度兒童遊戲場管理人員安全培訓研習")
        for y in (113, 115, 114)
    ]
    d = resolve("hualien:兒童遊戲場管理人員安全培訓研習", v)
    assert [d[x.url].keep for x in v] == [False, True, False]
    assert d["https://a/113"].reason == "older_version"


def test_標題沒有年度時看正文的年度() -> None:
    a = m(
        "https://a/1",
        "平均每人每月消費支出1.5倍者（113年度為3萬5,575元）" + "其他說明。" * 40,
        title="身心障礙者生活補助",
    )
    b = m(
        "https://a/2",
        "平均每人每月消費支出1.5倍者（115年度為3萬8,787元）" + "不同的說明文字。" * 30,
        title="身心障礙者生活補助",
    )
    d = resolve("hualien:身心障礙者生活補助", [a, b])
    assert d[b.url].keep and not d[a.url].keep


def test_同一年度的不同期別_只留最新一期() -> None:
    a = m("https://a/1", "第一期課程內容。" * 30, title="嘉義市114年銀采學堂第1期招生簡章")
    b = m("https://a/2", "第二期的課程完全不同。" * 30, title="嘉義市114年銀采學堂第2期招生簡章")
    d = resolve("chiayi:銀采學堂招生", [a, b])
    assert d[b.url].keep and not d[a.url].keep


def test_只有發布日期不同_不當成版本_拆開() -> None:
    # 金門三個「中心介紹」是不同的中心，發布日期不同不代表新舊版本
    a = m("https://a/1", "婦幼中心提供親職教育。" * 30, title="中心介紹", published=date(2024, 10, 8))
    b = m("https://a/2", "托育資源中心提供玩具借用。" * 30, title="中心介紹", published=date(2026, 2, 4))
    d = resolve("kinmen:中心介紹", [a, b])
    assert d[a.url].keep and d[b.url].keep and d[a.url].key != d[b.url].key


def test_結果與順序無關() -> None:
    v = [m(f"https://a/{i}", f"第{i}個不同的福利內容，說明各不相同。" * (10 + i)) for i in range(4)]
    assert resolve(KEY, v) == resolve(KEY, list(reversed(v)))


def test_年度與期別的擷取() -> None:
    assert latest_year("114至115年度、2027年") == 116
    assert latest_year("沒有年度") is None
    assert period("第十二期") == 12 and period("第2梯次") == 2 and period("第二十期") == 20 and period("簡章") is None
    assert identity_terms("中低收入老人") == {"中低收入", "老人"}
    assert identity_terms("低收入戶及中低收入戶") == {"低收入戶", "中低收入"}
