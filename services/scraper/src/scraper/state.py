"""狀態表（docs/scraper.md §6.4）：用 content_hash 判斷新增、更新、下架。

本機與 P0 用 SQLite；正式環境之後改為後端 Postgres 的 `scraper` schema（同樣的欄位）。

- `content_hash`：最後一次「處理完」時的 hash（推送、過濾、隔離都算處理完）。
  hash 沒變就不再重新處理，也不會重新下載附件。
- `pushed_hash`：最後一次成功推送的 hash。推送失敗時不更新 content_hash，下次會重試。
- `pushed_key`：最後一次推送用的 program_key（同名網址拆成不同的鍵時會和標題算出來的不同，見 siblings.py）。
  NULL＝這個欄位加入前推送的，用的是標題算出來的鍵。
- `superseded`：被同一福利的另一個網址取代（同一頁的另一個網址、或較舊的年度），不推送。
- 下架：完整跑完、且健康檢查正常的執行中，連續 2 次沒看到才算下架。
"""

import sqlite3
from datetime import UTC, datetime
from enum import StrEnum
from pathlib import Path

REMOVE_AFTER_MISSES = 2

SCHEMA = """
CREATE TABLE IF NOT EXISTS pages (
  url           TEXT PRIMARY KEY,
  site_id       TEXT NOT NULL,
  title         TEXT,
  content_hash  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | active | filtered | quarantined | superseded | removed
  reason        TEXT,
  label         TEXT,
  first_seen    TEXT NOT NULL,
  last_seen     TEXT NOT NULL,
  last_changed  TEXT,
  pushed_hash   TEXT,
  pushed_key    TEXT,
  last_run      TEXT,
  miss_count    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS pages_site ON pages(site_id, status);
CREATE TABLE IF NOT EXISTS runs (
  run_id   TEXT NOT NULL,
  site_id  TEXT NOT NULL,
  started  TEXT NOT NULL,
  seen     INTEGER NOT NULL,
  health   TEXT NOT NULL,
  PRIMARY KEY (run_id, site_id)
);
"""


class Change(StrEnum):
    NEW = "new"
    UPDATED = "updated"
    UNCHANGED = "unchanged"


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class State:
    def __init__(self, path: Path | str) -> None:
        if isinstance(path, Path):
            path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(str(path))
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)
        # 舊的狀態檔沒有後來加的欄位
        cols = {r["name"] for r in self.db.execute("PRAGMA table_info(pages)")}
        if "pushed_key" not in cols:
            self.db.execute("ALTER TABLE pages ADD COLUMN pushed_key TEXT")
            self.db.commit()

    def close(self) -> None:
        self.db.close()

    def observe(self, url: str, site_id: str, title: str, content_hash: str, run_id: str) -> Change:
        """記錄這次看到了這個網址，回傳和上次處理時相比的變化。"""
        now = _now()
        row = self.db.execute("SELECT content_hash, status FROM pages WHERE url = ?", (url,)).fetchone()
        if row is None:
            self.db.execute(
                "INSERT INTO pages (url, site_id, title, first_seen, last_seen, last_run) VALUES (?, ?, ?, ?, ?, ?)",
                (url, site_id, title, now, now, run_id),
            )
            self.db.commit()
            return Change.NEW
        self.db.execute(
            "UPDATE pages SET title = ?, last_seen = ?, last_run = ?, miss_count = 0 WHERE url = ?",
            (title, now, run_id, url),
        )
        self.db.commit()
        if row["status"] != "removed" and row["content_hash"] == content_hash:
            return Change.UNCHANGED
        return Change.UPDATED

    def keep(self, url: str, run_id: str) -> bool:
        """這次抓得不完整：只記下看到了（不算沒出現），內容與 hash 維持上次的。回傳狀態表裡有沒有這個網址。"""
        cur = self.db.execute(
            "UPDATE pages SET last_seen = ?, last_run = ?, miss_count = 0 WHERE url = ? AND status != 'removed'",
            (_now(), run_id, url),
        )
        self.db.commit()
        return cur.rowcount > 0

    def settle(self, url: str, status: str, content_hash: str, reason: str | None = None) -> None:
        """處理完成：記下結果與當下的 hash。"""
        self.db.execute(
            "UPDATE pages SET status = ?, reason = ?, content_hash = ?, last_changed = ? WHERE url = ?",
            (status, reason, content_hash, _now(), url),
        )
        self.db.commit()

    def mark_pushed(self, url: str, content_hash: str, program_key: str | None = None) -> None:
        self.db.execute(
            "UPDATE pages SET pushed_hash = ?, pushed_key = ? WHERE url = ?", (content_hash, program_key, url)
        )
        self.db.commit()

    def page(self, url: str) -> sqlite3.Row | None:
        """status、pushed_hash、pushed_key 等目前的狀態"""
        row: sqlite3.Row | None = self.db.execute("SELECT * FROM pages WHERE url = ?", (url,)).fetchone()
        return row

    def sweep(self, site_id: str, run_id: str) -> list[str]:
        """這次沒看到的網址累計一次未出現；達到門檻的標為下架，回傳曾推送過、需要通知後端下架的網址。"""
        self.db.execute(
            "UPDATE pages SET miss_count = miss_count + 1 "
            "WHERE site_id = ? AND status != 'removed' AND (last_run IS NULL OR last_run != ?)",
            (site_id, run_id),
        )
        rows = self.db.execute(
            "SELECT url, pushed_hash FROM pages WHERE site_id = ? AND status != 'removed' AND miss_count >= ?",
            (site_id, REMOVE_AFTER_MISSES),
        ).fetchall()
        for r in rows:
            self.db.execute("UPDATE pages SET status = 'removed', last_changed = ? WHERE url = ?", (_now(), r["url"]))
        self.db.commit()
        return [r["url"] for r in rows if r["pushed_hash"]]

    def record_run(self, run_id: str, site_id: str, seen: int, health: str) -> None:
        self.db.execute(
            "INSERT OR REPLACE INTO runs (run_id, site_id, started, seen, health) VALUES (?, ?, ?, ?, ?)",
            (run_id, site_id, _now(), seen, health),
        )
        self.db.commit()

    def last_ok_seen(self, site_id: str) -> int | None:
        row = self.db.execute(
            "SELECT seen FROM runs WHERE site_id = ? AND health = 'ok' ORDER BY started DESC LIMIT 1", (site_id,)
        ).fetchone()
        return int(row["seen"]) if row else None

    def counts(self, site_id: str) -> dict[str, int]:
        rows = self.db.execute("SELECT status, COUNT(*) n FROM pages WHERE site_id = ? GROUP BY status", (site_id,))
        return {r["status"]: int(r["n"]) for r in rows}
