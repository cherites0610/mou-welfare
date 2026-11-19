from scraper.state import Change, State


def test_新增_未變_更新() -> None:
    s = State(":memory:")
    assert s.observe("u1", "k", "t", "h1", "r1") is Change.NEW
    s.settle("u1", "active", "h1")
    assert s.observe("u1", "k", "t", "h1", "r2") is Change.UNCHANGED
    assert s.observe("u1", "k", "t", "h2", "r3") is Change.UPDATED


def test_沒處理完的項目下次重新處理() -> None:
    s = State(":memory:")
    s.observe("u1", "k", "t", "h1", "r1")  # 推送失敗，沒有 settle
    assert s.observe("u1", "k", "t", "h1", "r2") is Change.UPDATED


def test_連續兩次沒看到才下架_只回報推送過的() -> None:
    s = State(":memory:")
    for url in ("pushed", "filtered"):
        s.observe(url, "k", "t", "h", "r1")
    s.settle("pushed", "active", "h")
    s.mark_pushed("pushed", "h")
    s.settle("filtered", "filtered", "h")
    assert s.sweep("k", "r1") == []
    assert s.sweep("k", "r2") == []  # 第一次沒看到
    assert s.sweep("k", "r3") == ["pushed"]  # 第二次 → 下架；filtered 從沒推送過，不必通知後端
    assert s.counts("k") == {"removed": 2}


def test_重新出現就重置未出現次數_下架的重新出現視為更新() -> None:
    s = State(":memory:")
    s.observe("u", "k", "t", "h", "r1")
    s.settle("u", "active", "h")
    s.sweep("k", "r2")
    s.observe("u", "k", "t", "h", "r3")
    assert s.sweep("k", "r3") == []
    s.sweep("k", "r4")
    s.sweep("k", "r5")
    assert s.observe("u", "k", "t", "h", "r6") is Change.UPDATED


def test_健康檢查基準只取正常執行() -> None:
    s = State(":memory:")
    assert s.last_ok_seen("k") is None
    s.record_run("r1", "k", 50, "ok")
    s.record_run("r2", "k", 3, "partial")
    assert s.last_ok_seen("k") == 50
