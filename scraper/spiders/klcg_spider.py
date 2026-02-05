import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin
from lib.utils import parse_to_iso_date, clean_text
from lib.file_handler import extract_content_from_url
from lib.output_handler import handle_output

class KLCGScraper:
    def __init__(self):
        self.root_url = "https://www.klcg.gov.tw/tw/social/2748.html"
        self.base_domain = "https://www.klcg.gov.tw"
        self.city = "基隆市"

    def _get_soup(self, url):
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(url)
            resp.raise_for_status()
            return BeautifulSoup(resp.text, 'html.parser')

    def get_root_folders(self):
        soup = self._get_soup(self.root_url)
        links = soup.select(".np li a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def get_sub_folders(self, folder_url):
        soup = self._get_soup(folder_url)
        links = soup.select(".np li a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def get_item_list(self, sub_folder_url):
        soup = self._get_soup(sub_folder_url)
        links = soup.select(".list a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def parse_detail(self, detail_url):
        soup = self._get_soup(detail_url)

        raw_date = soup.select_one(".publish_info").get_text(strip=True) if soup.select_one(".publish_info") else ""
        publish_date = parse_to_iso_date(raw_date)

        # 抓取並初步清洗主內文
        main_content = soup.select_one(".cp").get_text() if soup.select_one(".cp") else ""

        file_links = soup.select(".file_download a")
        attachment_text = ""

        for link in file_links:
            f_url = urljoin(self.base_domain, link['href'])
            if any(f_url.lower().endswith(ext) for ext in [".pdf", ".txt",'.odt','.docx']):
                extracted_text = extract_content_from_url(f_url)
                if extracted_text:
                    file_name = link.get_text(strip=True)
                    attachment_text += f"\n[附件內容: {file_name}]\n{extracted_text}"

        # 最終合併後進行深度清洗
        combined_content = main_content + attachment_text
        final_content = clean_text(combined_content)

        data = {
            "sourceCity": self.city,
            "sourceUrl": detail_url,
            "originalName": soup.select_one("h2.title").get_text(strip=True) if soup.select_one("h2.title") else "",
            "publishDate": publish_date,
            "originalContent": final_content
        }
        return data

    def run(self):
        root_folders = self.get_root_folders()
        for r_url in root_folders:
            sub_folders = self.get_sub_folders(r_url)
            for s_url in sub_folders:
                items = self.get_item_list(s_url)
                for item_url in items:
                    try:
                        final_data = self.parse_detail(item_url)
                        handle_output(final_data)
                        print(f"Processed: {final_data['originalName']}")
                    except Exception as e:
                        print(f"Error processing {item_url}: {e}")
