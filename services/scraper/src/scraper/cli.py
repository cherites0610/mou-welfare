"""CLI（docs/scraper.md §8）：scrape sites / scrape run。

    scrape run --site kinmen            # dry-run：結果寫到 out/{run_id}/kinmen.jsonl
    scrape run --site kinmen --limit 5  # 只處理 5 筆（不判定下架）
    scrape run --push                   # 推送到 API（需要 API_BASE、INGEST_HMAC_KEY）

dry-run 與正式推送使用不同的狀態檔，互不影響。
"""

import logging
import os
from datetime import datetime
from pathlib import Path
from typing import Annotated
from zoneinfo import ZoneInfo

import typer

from scraper.adapters import get_adapter
from scraper.fetch import Fetcher
from scraper.pipeline import JsonlSink, Sink, SiteResult, SiteRun
from scraper.push import Pusher
from scraper.report import run_payload, summary_table, write_report
from scraper.sites import load_sites
from scraper.state import State

TZ = ZoneInfo("Asia/Taipei")
ROOT = Path(__file__).resolve().parents[2]

app = typer.Typer(help="哞福利爬蟲", no_args_is_help=True)


@app.command()
def sites() -> None:
    """列出所有站點設定。"""
    for s in load_sites().values():
        sources = len(s.seeds) or len(s.datasets)
        typer.echo(f"{s.id:<12} {s.city:<6} {s.adapter:<12} sources={sources}")


@app.command()
def run(
    site: Annotated[list[str] | None, typer.Option(help="只跑指定站點（可重複）")] = None,
    push: Annotated[bool, typer.Option("--push", help="推送到 API；預設為 dry-run")] = False,
    limit: Annotated[int | None, typer.Option(help="每站最多處理幾筆（測試用，不判定下架）")] = None,
    delay: Annotated[float, typer.Option(help="同一主機的請求間隔（秒），不得低於 2")] = 2.0,
    state_path: Annotated[Path | None, typer.Option("--state", help="狀態檔（SQLite）")] = None,
    out: Annotated[Path, typer.Option(help="dry-run 輸出與報告的目錄")] = ROOT / "out",
    trigger: Annotated[str, typer.Option(help="回報給管理後台的觸發方式：manual／schedule")] = "manual",
    interval_days: Annotated[int | None, typer.Option(help="排程間隔（天），後台據此判斷逾期")] = None,
    verbose: Annotated[bool, typer.Option("-v")] = False,
) -> None:
    """執行爬取。--push 時會把進度回報給 API（管理後台的爬蟲頁）。"""
    logging.basicConfig(level=logging.INFO if verbose else logging.WARNING, format="%(levelname)s %(message)s")
    if trigger not in ("manual", "schedule"):
        raise typer.BadParameter("manual 或 schedule", param_hint="--trigger")
    if delay < 2.0:
        raise typer.BadParameter("禮貌爬取規則：同一主機的請求間隔至少 2 秒", param_hint="--delay")
    site = site or []
    all_sites = load_sites()
    unknown = [s for s in site if s not in all_sites]
    if unknown:
        raise typer.BadParameter(f"unknown site: {', '.join(unknown)}", param_hint="--site")
    targets = [all_sites[s] for s in site] if site else list(all_sites.values())

    now = datetime.now(TZ)
    run_id = now.strftime("%Y%m%d-%H%M%S")
    sink: Sink
    pusher: Pusher | None = None
    if push:
        api_base, key = os.environ.get("API_BASE"), os.environ.get("INGEST_HMAC_KEY")
        if not api_base or not key:
            raise typer.BadParameter("--push 需要環境變數 API_BASE 與 INGEST_HMAC_KEY")
        sink = pusher = Pusher(api_base, key)
    else:
        sink = JsonlSink(out / run_id)
    state = State(state_path or ROOT / ".state" / ("state.db" if push else "dry-run.db"))

    results: list[SiteResult] = []
    planned = [c.id for c in targets]

    def progress(current: str | None, finished: bool = False) -> None:
        # 回報失敗不影響爬取（API 暫時不通時，後台會在 4 小時後顯示為中斷）
        if not pusher:
            return
        payload = run_payload(
            run_id,
            trigger=trigger,
            interval_days=interval_days,
            started_at=now.isoformat(),
            planned=planned,
            results=results,
            current=current,
            finished=finished,
        )
        try:
            pusher.report_run(payload)
        except Exception as e:
            typer.echo(f"report failed: {e}", err=True)

    progress(planned[0] if planned else None)
    with Fetcher(delay=delay) as fetcher:
        for i, cfg in enumerate(targets):
            typer.echo(f"→ {cfg.id}", err=True)
            started = datetime.now(TZ)
            try:
                adapter = get_adapter(cfg, fetcher)
                runner = SiteRun(cfg, adapter, fetcher, state, run_id=run_id, today=now.date(), limit=limit)
                result = runner.run(sink)
            except Exception as e:  # 一站整個失敗（設定錯誤、程式錯誤）不影響其他站
                logging.exception("site %s", cfg.id)
                result = SiteResult(cfg.id, health="failed", health_detail=f"{type(e).__name__}: {e}"[:500])
            result.city = cfg.city
            result.started_at = started.isoformat()
            result.finished_at = datetime.now(TZ).isoformat()
            results.append(result)
            if i + 1 < len(targets):
                progress(targets[i + 1].id)
    state.close()
    progress(None, finished=True)

    typer.echo(summary_table(results))
    report = write_report(out / "reports", run_id, results)
    typer.echo(f"\nreport: {report}")
    if not push:
        typer.echo(f"output: {out / run_id}")
    if any(r.health != "ok" for r in results):
        raise typer.Exit(code=1)


@app.command()
def replay(
    run_dir: Annotated[Path, typer.Argument(help="dry-run 的輸出目錄（out/{run_id}）")],
    site: Annotated[list[str] | None, typer.Option(help="只送指定站點（可重複）")] = None,
) -> None:
    """把 dry-run 的結果推送到 API（人工檢查過 dry-run 後再發布，不必重新爬）。

    不會更新狀態檔：之後正式執行時這些網址仍視為新增，後端以 program_key upsert，內容相同會判定為沒變。
    """
    import json

    from scraper.models import IngestItem
    from scraper.push import PushError

    api_base, key = os.environ.get("API_BASE"), os.environ.get("INGEST_HMAC_KEY")
    if not api_base or not key:
        raise typer.BadParameter("需要環境變數 API_BASE 與 INGEST_HMAC_KEY")
    files = sorted(run_dir.glob("*.jsonl"))
    if site:
        files = [f for f in files if f.stem in site]
    if not files:
        raise typer.BadParameter(f"{run_dir} 沒有要推送的 *.jsonl")
    from scraper.filter.rules import judge_title

    all_sites = load_sites()
    pusher = Pusher(api_base, key)
    failed = 0
    try:
        for f in files:
            sent = skipped = 0
            cfg = all_sites.get(f.stem)
            # 用 \n 分行，不能用 splitlines()：正文裡的 U+2028 等字元在 JSON 中沒有跳脫，會被誤切
            for line in f.read_text(encoding="utf-8").split("\n"):
                if not line:
                    continue
                item = IngestItem.model_validate(json.loads(line))
                # 用目前的標題規則再篩一次：dry-run 之後新增的排除字也會生效，不必重新爬
                if judge_title(item.title, tuple(cfg.exclude_title) if cfg else ()) == "exclude":
                    skipped += 1
                    continue
                try:
                    pusher.ingest(item)
                    sent += 1
                except PushError as e:
                    failed += 1
                    typer.echo(f"  ✗ {e}", err=True)
            typer.echo(f"{f.stem:<10} pushed {sent}" + (f", skipped {skipped} by title rules" if skipped else ""))
    finally:
        pusher.close()
    if failed:
        typer.echo(f"failed: {failed}", err=True)
        raise typer.Exit(code=1)


@app.command()
def sample(
    run_dir: Annotated[Path, typer.Argument(help="dry-run 的輸出目錄（out/{run_id}）")],
    n: Annotated[int, typer.Option("-n", help="抽樣篇數，各站平均分配")] = 50,
    seed: Annotated[int, typer.Option(help="亂數種子（同一個種子抽到同樣的篇目）")] = 0,
) -> None:
    """從 dry-run 結果抽樣，產生人工檢查用的 Markdown（P0 完成標準：人工檢查 50 篇）。"""
    import json
    import random

    files = sorted(run_dir.glob("*.jsonl"))
    if not files:
        raise typer.BadParameter(f"{run_dir} 沒有 *.jsonl")
    rng = random.Random(seed)
    per_site = max(1, n // len(files))
    parts = [f"# 抽取品質抽查（{run_dir.name}）", ""]
    parts += ["每篇檢查：標題正確、正文完整（沒有選單或頁尾）、日期正確、附件有文字、是個人可申請的福利。", ""]
    for f in files:
        items = [json.loads(line) for line in f.read_text(encoding="utf-8").split("\n") if line]
        for d in rng.sample(items, min(per_site, len(items))):
            atts = ", ".join(f"{a['name']}（{len(a['text'])} 字）" for a in d["attachments"]) or "無"
            parts += [
                f"## {d['title']}",
                "",
                f"- 站點：{d['source']['site_id']}　program_key：`{d['program_key']}`",
                f"- 來源：<{d['source']['url']}>",
                f"- 發布日期：{d['published_at'] or '（無）'}　正文：{len(d['content_md'])} 字　附件：{atts}",
                "",
                "<details><summary>正文</summary>",
                "",
                d["content_md"][:3000],
                "",
                "</details>",
                "",
                "- [ ] 合格　備註：",
                "",
            ]
    out = run_dir / "sample.md"
    out.write_text("\n".join(parts), encoding="utf-8")
    typer.echo(out)


if __name__ == "__main__":
    app()
