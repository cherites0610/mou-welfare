import os
import concurrent.futures
from dotenv import load_dotenv
from spiders.klcg_spider import KLCGScraper
from spiders.tycg_spider import TYCGScraper

load_dotenv()

def run_scraper(scraper_instance):
    try:
        scraper_instance.run()
    except Exception as e:
        print(f"Scraper execution failed: {type(scraper_instance).__name__} - {e}")

def main():
    scrapers = [
        KLCGScraper(),
        # TYCGScraper(),
        # Site02Scraper(),
        # Site03Scraper(),
    ]

    max_workers = int(os.getenv("MAX_WORKERS", 3))

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        executor.map(run_scraper, scrapers)

if __name__ == "__main__":
    main()
