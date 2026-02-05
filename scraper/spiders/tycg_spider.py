import httpx
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
from lib.utils import parse_to_iso_date, clean_text
from lib.file_handler import extract_content_from_url
from lib.output_handler import handle_output

class TYCGScraper:
    def __init__(self):
        self.root_url = "https://sab.tycg.gov.tw/cl.aspx?n=7313"
        self.base_domain = "https://sab.tycg.gov.tw"
        self.city = "桃園市"

    def _get_soup(self, url):
        try:
            # 加入 follow_redirects=True 嘗試跟隨，若仍失敗則視為無效
            with httpx.Client(timeout=20.0, follow_redirects=True) as client:
                resp = client.get(url)
                if resp.status_code == 200:
                    return BeautifulSoup(resp.text, 'html.parser')
                return None
        except Exception:
            return None

    def get_root_folders(self):
        soup = self._get_soup(self.root_url)
        if not soup: return []
        links = soup.select(".content-list a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def get_sub_folders(self, folder_url):
        soup = self._get_soup(folder_url)
        if not soup: return []
        links = soup.select(".content-list a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def get_item_list(self, sub_folder_url):
        soup = self._get_soup(sub_folder_url)
        if not soup: return []
        links = soup.select("table a")
        return [urljoin(self.base_domain, a['href']) for a in links]

    def parse_detail(self, detail_url):
        soup = self._get_soup(detail_url)
        if not soup: return None

        raw_date = soup.select_one(".page-footer .detail").get_text(strip=True) if soup.select_one(".page-footer .detail") else ""
        publish_date = parse_to_iso_date(raw_date)

        main_content = soup.select_one(".page-content").get_text() if soup.select_one(".page-content") else ""

        file_links = soup.select(".file-download-multiple a")
        attachment_text = ""
        for link in file_links:
          href = link.get('href')
          if not href: continue

          f_url = urljoin(self.base_domain, href)
          parsed = urlparse(f_url)

          if all([parsed.scheme, parsed.netloc]):
              extracted_text = extract_content_from_url(f_url)
              if extracted_text:
                  file_name = link.get_text(strip=True)
                  attachment_text += f"\n[附件內容: {file_name}]\n{extracted_text}"

        combined_content = main_content + attachment_text
        final_content = clean_text(combined_content)

        data = {
            "sourceCity": self.city,
            "sourceUrl": detail_url,
            "originalName": soup.select_one(".page-content .title").get_text(strip=True) if soup.select_one(".page-content .title") else "",
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
                        if final_data:
                            handle_output(final_data)
                            print(f"Processed: {final_data['originalName']}")
                    except Exception as e:
                        print(f"Error processing {item_url}: {e}")
