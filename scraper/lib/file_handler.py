import httpx
import io
from pypdf import PdfReader
from odf.opendocument import load
from odf import teletype
from docx import Document

# 改用 MIME Type 進行對應
MIME_MAP = {
    "application/pdf": "_parse_pdf",
    "text/plain": "text_decode",
    "application/vnd.oasis.opendocument.text": "_parse_odt",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "_parse_docx"
}

MAX_PDF_PAGES = 5

def extract_content_from_url(file_url: str) -> str:
    try:
        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            resp = client.get(file_url)
            resp.raise_for_status()

            # 從 Header 獲取 Content-Type (例如: application/pdf; charset=utf-8)
            content_type = resp.headers.get("Content-Type", "").split(";")[0].lower()
            content_bytes = resp.content

            if content_type == "application/pdf":
                return _parse_pdf(content_bytes)

            if content_type == "text/plain":
                return content_bytes.decode("utf-8", errors="ignore")

            if content_type == "application/vnd.oasis.opendocument.text":
                return _parse_odt(content_bytes)

            if content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
                return _parse_docx(content_bytes)

            # 如果 Header 沒有提供正確資訊，嘗試用內容特徵判斷 (選配)
            print(f"Unsupported or unknown Content-Type: {content_type}")

    except Exception as e:
        print(f"File process error: {file_url} - {e}")

    return ""

def _parse_pdf(binary_data: bytes) -> str:
    try:
        text = ""
        with io.BytesIO(binary_data) as f:
            reader = PdfReader(f)
            pages = reader.pages
            target_pages = pages[:MAX_PDF_PAGES]
            for page in target_pages:
                extracted = page.extract_text()
                if extracted:
                    text += extracted + "\n"
        return text
    except Exception:
        return ""

def _parse_odt(binary_data: bytes) -> str:
    try:
        with io.BytesIO(binary_data) as f:
            doc = load(f)
            return teletype.extractText(doc.text)
    except Exception:
        return ""

def _parse_docx(binary_data: bytes) -> str:
    try:
        with io.BytesIO(binary_data) as f:
            doc = Document(f)
            full_text = []
            for para in doc.paragraphs:
                full_text.append(para.text)
            return "\n".join(full_text)
    except Exception:
        return ""
