"""通用抽取（docs/scraper.md §6.3）：不寫任何內文 selector，正文交給 trafilatura。"""

from scraper.extract.html import AttachmentLink, Extracted, extract_html

__all__ = ["AttachmentLink", "Extracted", "extract_html"]
