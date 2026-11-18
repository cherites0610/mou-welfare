"""推送給 API 的資料格式。

權威定義在 packages/shared/src/ingest.ts（Zod），並輸出為 schemas/ingest.schema.json；
tests/test_contract.py 確保這裡的輸出符合該 JSON Schema。
"""

from datetime import date
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl

ClassificationType = Literal[
    "program", "announcement", "minutes", "procurement", "org_grant", "event", "statistics", "other"
]


class Source(BaseModel):
    site_id: str = Field(pattern=r"^[a-z0-9_-]+$")
    city: str = Field(min_length=2)
    url: HttpUrl
    kind: Literal["cms", "opendata", "portal"]


class Attachment(BaseModel):
    name: str = Field(min_length=1)
    url: HttpUrl
    text: str


class Classification(BaseModel):
    type: ClassificationType
    confidence: float = Field(ge=0, le=1)


class IngestItem(BaseModel):
    source: Source
    program_key: str = Field(min_length=3)
    title: str = Field(min_length=4)
    published_at: date | None
    content_md: str = Field(min_length=80)
    attachments: list[Attachment] = Field(default_factory=list)
    structured: dict[str, Any] = Field(default_factory=dict)
    classification: Classification
    content_hash: str = Field(pattern=r"^sha256:[0-9a-f]{64}$")

    def to_payload(self) -> dict[str, Any]:
        return self.model_dump(mode="json")
