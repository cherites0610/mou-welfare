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
from scraper.report import summary_table, write_report
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
    verbose: Annotated[bool, typer.Option("-v")] = False,
) -> None:
    """執行爬取。"""
    logging.basicConfig(level=logging.INFO if verbose else logging.WARNING, format="%(levelname)s %(message)s")
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
    if push:
        api_base, key = os.environ.get("API_BASE"), os.environ.get("INGEST_HMAC_KEY")
        if not api_base or not key:
            raise typer.BadParameter("--push 需要環境變數 API_BASE 與 INGEST_HMAC_KEY")
        sink = Pusher(api_base, key)
    else:
        sink = JsonlSink(out / run_id)
    state = State(state_path or ROOT / ".state" / ("state.db" if push else "dry-run.db"))

    results: list[SiteResult] = []
    with Fetcher(delay=delay) as fetcher:
        for cfg in targets:
            typer.echo(f"→ {cfg.id}", err=True)
            adapter = get_adapter(cfg, fetcher)
            runner = SiteRun(cfg, adapter, fetcher, state, run_id=run_id, today=now.date(), limit=limit)
            results.append(runner.run(sink))
    state.close()

    typer.echo(summary_table(results))
    report = write_report(out / "reports", run_id, results)
    typer.echo(f"\nreport: {report}")
    if not push:
        typer.echo(f"output: {out / run_id}")
    if any(r.health != "ok" for r in results):
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
        items = [json.loads(line) for line in f.read_text(encoding="utf-8").splitlines() if line]
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
