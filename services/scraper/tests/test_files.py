import io
import zipfile

from scraper.extract.files import parse_file, sniff


def _mini_pdf(text: str) -> bytes:
    """最小的文字 PDF（一頁一行），xref 位移實際計算，pypdf 才讀得到。"""
    stream = f"BT /F1 12 Tf 20 100 Td ({text}) Tj ET".encode()
    objects = [
        b"<</Type/Catalog/Pages 2 0 R>>",
        b"<</Type/Pages/Kids[3 0 R]/Count 1>>",
        b"<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>",
        b"<</Length %d>>stream\n%s\nendstream" % (len(stream), stream),
        b"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objects, 1):
        offsets.append(len(out))
        out += b"%d 0 obj%sendobj\n" % (i, body)
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objects) + 1)
    out += b"".join(b"%010d 00000 n \n" % o for o in offsets)
    out += b"trailer<</Size %d/Root 1 0 R>>\nstartxref\n%d\n%%%%EOF" % (len(objects) + 1, xref)
    return bytes(out)


MINI_PDF = _mini_pdf("Hello PDF")


def _docx() -> bytes:
    import docx

    d = docx.Document()
    d.add_paragraph("申請資格：年滿65歲")
    t = d.add_table(rows=1, cols=2)
    t.rows[0].cells[0].text = "金額"
    t.rows[0].cells[1].text = "8,329元"
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def _odt() -> bytes:
    from odf.opendocument import OpenDocumentText
    from odf.text import P

    d = OpenDocumentText()
    d.text.addElement(P(text="應備文件：身分證"))
    buf = io.BytesIO()
    d.save(buf)
    return buf.getvalue()


def test_依內容判斷格式_不看副檔名() -> None:
    assert sniff(MINI_PDF) == "pdf"
    assert sniff(_docx()) == "docx"
    assert sniff(_odt()) == "odf"
    assert sniff(b"\xd0\xcf\x11\xe0rest") == "doc"
    assert sniff(b"<!DOCTYPE html><html>") == "html"  # 下載連結失效時常回錯誤頁


def test_解析PDF() -> None:
    assert "Hello PDF" in parse_file(MINI_PDF).text


def test_解析DOCX_含表格() -> None:
    text = parse_file(_docx()).text
    assert "申請資格：年滿65歲" in text and "金額 | 8,329元" in text


def test_解析ODT() -> None:
    assert parse_file(_odt()).text == "應備文件：身分證"


def test_不支援或損毀的檔案回傳空字串() -> None:
    assert parse_file(b"\xd0\xcf\x11\xe0rest").text == ""
    assert parse_file(b"%PDF-1.4 broken").text == ""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("other.txt", "x")
    assert parse_file(buf.getvalue()).format == "unknown"


def test_去掉控制字元() -> None:
    from scraper.extract.files import _normalize

    assert _normalize("申請\x00資格\x07：年滿65歲\n\n\n說明") == "申請資格：年滿65歲\n\n說明"
