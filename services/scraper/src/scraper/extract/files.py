"""附件解析：依檔案內容（magic bytes）判斷格式，不看副檔名（docs/scraper.md §6.3）。

P0 支援 PDF（文字層）、DOCX、ODF（ODT/ODS）。DOC、XLS 等舊格式需要 LibreOffice 轉檔，
掃描 PDF 需要 Gemini，兩者都在之後的階段加入；目前回傳空字串並記錄格式。
"""

import io
import logging
import re
import zipfile
from dataclasses import dataclass

log = logging.getLogger(__name__)
# pypdf 遇到不標準的 PDF 會大量印出警告（字型、xref），不影響抽出的文字
logging.getLogger("pypdf").setLevel(logging.ERROR)

MAX_ATTACHMENT_CHARS = 30_000


@dataclass(frozen=True)
class ParsedFile:
    format: str  # pdf | docx | odf | doc | xlsx | html | unknown
    text: str


def sniff(content: bytes) -> str:
    if content.startswith(b"%PDF"):
        return "pdf"
    if content.startswith(b"\xd0\xcf\x11\xe0"):
        return "doc"  # OLE：DOC、XLS、PPT
    if content.startswith(b"PK"):
        try:
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                names = set(z.namelist())
                if "word/document.xml" in names:
                    return "docx"
                if "xl/workbook.xml" in names:
                    return "xlsx"
                if "mimetype" in names and z.read("mimetype").startswith(b"application/vnd.oasis.opendocument"):
                    return "odf"
        except zipfile.BadZipFile:
            return "unknown"
        return "unknown"
    head = content[:512].lstrip().lower()
    if head.startswith((b"<!doctype html", b"<html")):
        return "html"  # 下載連結失效時，很多網站回傳錯誤頁而不是 404
    return "unknown"


# PDF 抽出的文字常夾雜 NUL 等控制字元；Postgres 的 text 不能存 NUL（後端會回 500）
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")


def _normalize(text: str) -> str:
    text = _CONTROL.sub("", text)
    text = re.sub(r"[ \t　\xa0]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()[:MAX_ATTACHMENT_CHARS]


def _pdf(content: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(content))
    parts: list[str] = []
    total = 0
    for page in reader.pages:
        t = page.extract_text() or ""
        parts.append(t)
        total += len(t)
        if total > MAX_ATTACHMENT_CHARS:
            break
    return "\n".join(parts)


def _docx(content: bytes) -> str:
    import docx

    d = docx.Document(io.BytesIO(content))
    parts = [p.text for p in d.paragraphs]
    for table in d.tables:
        for row in table.rows:
            parts.append(" | ".join(c.text.strip() for c in row.cells))
    return "\n".join(parts)


def _odf(content: bytes) -> str:
    from odf import teletype, text
    from odf.opendocument import load

    d = load(io.BytesIO(content))
    return "\n".join(teletype.extractText(p) for p in d.getElementsByType(text.P))


_PARSERS = {"pdf": _pdf, "docx": _docx, "odf": _odf}


def parse_file(content: bytes) -> ParsedFile:
    fmt = sniff(content)
    parser = _PARSERS.get(fmt)
    if parser is None:
        return ParsedFile(fmt, "")
    try:
        return ParsedFile(fmt, _normalize(parser(content)))
    except Exception as e:  # 檔案損毀或格式不標準：只影響這個附件
        log.warning("parse %s failed: %s", fmt, e)
        return ParsedFile(fmt, "")
