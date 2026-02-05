import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from lib.output_handler import handle_output
from lib.utils import parse_to_iso_date, clean_text
from lib.file_handler import extract_content_from_url

class BaseScraper:
    def __init__(self, city, root_url, base_domain):
        self.city = city
        self.root_url = root_url
        self.base_domain = base_domain

    def _get_soup(self, url):
        with httpx.Client(timeout=20.0, follow_redirects=True) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, 'html.parser')

    def process_and_save(self, detail_url, name_selector, date_selector, content_selector, file_selector=None):
        soup = self._get_soup(detail_url)

        raw_date = soup.select_one(date_selector).get_text(strip=True) if soup.select_one(date_selector) else ""
        main_content = soup.select_one(content_selector).get_text() if soup.select_one(content_selector) else ""

        attachment_text = ""
        if file_selector:
            file_links = soup.select(file_selector)
            for link in file_links:
                f_url = urljoin(self.base_domain, link['href'])
                if any(f_url.lower().endswith(ext) for ext in [".pdf", ".txt"]):
                    extracted = extract_content_from_url(f_url)
                    if extracted:
                        attachment_text += f" [附件: {link.get_text(strip=True)}] {extracted}"

        data = {
            "sourceCity": self.city,
            "sourceUrl": detail_url,
            "originalName": soup.select_one(name_selector).get_text(strip=True) if soup.select_one(name_selector) else "",
            "publishDate": parse_to_iso_date(raw_date),
            "originalContent": clean_text(main_content + attachment_text)
        }
        handle_output(data)
