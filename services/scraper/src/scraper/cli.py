"""CLI：scrape run / init / sites（docs/scraper.md §8）。P0 只有骨架。"""

import typer

from scraper.sites import load_sites

app = typer.Typer(help="哞福利爬蟲", no_args_is_help=True)


@app.command()
def sites() -> None:
    """列出所有站點設定。"""
    for s in load_sites().values():
        typer.echo(f"{s.id:<12} {s.city:<6} {s.adapter:<8} seeds={len(s.seeds)}")


@app.command()
def run(site: str | None = typer.Option(None, help="只跑指定站點"), dry_run: bool = True) -> None:
    """執行爬取（尚未實作，P0 爬蟲原型時加入）。"""
    typer.echo(f"TODO: run site={site or 'ALL'} dry_run={dry_run}")
    raise typer.Exit(code=2)


if __name__ == "__main__":
    app()
