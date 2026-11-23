"""執行報告（docs/scraper.md §6.7）：reports/{run_id}.json 與 Markdown 摘要。"""

import json
from dataclasses import asdict
from pathlib import Path

from scraper.pipeline import SiteResult

COLUMNS = ("seen", "new", "updated", "unchanged", "removed", "filtered", "quarantined", "pushed")


def summary_table(results: list[SiteResult]) -> str:
    header = f"{'site':<10}" + "".join(f"{c[:6]:>8}" for c in COLUMNS) + "  health"
    lines = [header]
    for r in results:
        health = r.health.upper() if r.health != "ok" else "ok"
        if r.health_detail:
            health += f" ({r.health_detail})"
        lines.append(f"{r.site_id:<10}" + "".join(f"{getattr(r, c):>8}" for c in COLUMNS) + f"  {health}")
    return "\n".join(lines)


def to_markdown(run_id: str, results: list[SiteResult]) -> str:
    parts = [f"# 爬蟲執行報告 {run_id}", "", "```", summary_table(results), "```"]
    for r in results:
        if r.quarantine:
            parts += ["", f"## {r.site_id}：隔離 {len(r.quarantine)} 筆", ""]
            parts += [f"- {q['title'] or '(無標題)'} — {', '.join(q['issues'])}  <{q['url']}>" for q in r.quarantine]  # type: ignore[arg-type]
        if r.errors:
            parts += ["", f"## {r.site_id}：錯誤 {len(r.errors)} 筆", ""]
            parts += [f"- {e}" for e in r.errors[:50]]
    return "\n".join(parts) + "\n"


MAX_ERRORS = 50
MAX_QUARANTINE = 100


def _quarantine(q: dict[str, object]) -> dict[str, object]:
    issues = q.get("issues")
    return {
        "title": str(q.get("title") or "")[:300],
        "url": str(q.get("url") or "")[:2000],
        "issues": [str(i)[:100] for i in issues][:10] if isinstance(issues, list) else [],
    }


def site_payload(r: SiteResult) -> dict[str, object]:
    """POST /internal/scrape-runs 的每站結果（apps/api/src/features/scraper/schema.ts）。錯誤與隔離清單只送前幾筆。"""
    return {
        "site_id": r.site_id,
        "city": r.city or None,
        **{c: getattr(r, c) for c in (*COLUMNS, "push_failed", "pages")},
        "health": r.health,
        "health_detail": r.health_detail[:500],
        "errors": [e[:500] for e in r.errors[:MAX_ERRORS]],
        "error_count": len(r.errors),
        "quarantine": [_quarantine(q) for q in r.quarantine[:MAX_QUARANTINE]],
        "started_at": r.started_at,
        "finished_at": r.finished_at,
    }


def run_payload(
    run_id: str,
    *,
    trigger: str,
    interval_days: int | None,
    started_at: str,
    planned: list[str],
    results: list[SiteResult],
    current: str | None,
    finished: bool,
) -> dict[str, object]:
    return {
        "run_id": run_id,
        "trigger": trigger,
        "interval_days": interval_days,
        "started_at": started_at,
        "finished": finished,
        "planned": planned,
        "current": current,
        "sites": [site_payload(r) for r in results],
    }


def write_report(directory: Path, run_id: str, results: list[SiteResult]) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    data = {"run_id": run_id, "sites": [asdict(r) for r in results]}
    (directory / f"{run_id}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    md = directory / f"{run_id}.md"
    md.write_text(to_markdown(run_id, results), encoding="utf-8")
    return md
