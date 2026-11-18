"""契約測試（docs/testing.md §6）：爬蟲輸出必須符合 packages/shared 產生的 JSON Schema。"""

import json
from pathlib import Path

import jsonschema
import pytest

from scraper.models import IngestItem

SCHEMA_PATH = Path(__file__).resolve().parents[3] / "packages/shared/schemas/ingest.schema.json"


@pytest.fixture(scope="module")
def schema() -> dict[str, object]:
    return json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))  # type: ignore[no-any-return]


def sample() -> IngestItem:
    return IngestItem.model_validate(
        {
            "source": {
                "site_id": "kinmen",
                "city": "金門縣",
                "url": "https://social.kinmen.gov.tw/cp.aspx?n=1",
                "kind": "cms",
            },
            "program_key": "kinmen:中低收入老人生活津貼",
            "title": "中低收入老人生活津貼",
            "published_at": "2026-03-01",
            "content_md": "## 申請資格\n\n" + "年滿65歲並設籍本縣。" * 10,
            "classification": {"type": "program", "confidence": 0.92},
            "content_hash": "sha256:" + "a" * 64,
        }
    )


def test_輸出符合共用_schema(schema: dict[str, object]) -> None:
    jsonschema.validate(sample().to_payload(), schema, format_checker=jsonschema.FormatChecker())


def test_schema_拒絕不合格內容(schema: dict[str, object]) -> None:
    bad = sample().to_payload() | {"content_md": "太短"}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, schema)
