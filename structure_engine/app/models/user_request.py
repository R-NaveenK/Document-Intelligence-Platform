from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field
from app.models.extraction_input import RawExtractionInput

class FieldDefinition(BaseModel):
    key: str = Field(..., description="Normalized field identifier e.g. invoice_number")
    display_name: str = Field(..., description="Human readable label e.g. Invoice Number")
    data_type: str = Field(default="string", description="Field data type: string, number, date, array")
    is_list: bool = Field(default=False, description="True if field represents a repeating list/array")
    nested_fields: Optional[List['FieldDefinition']] = Field(default=None, description="Nested fields for line item objects")
    aliases: List[str] = Field(default_factory=list, description="Synonyms/aliases for candidate search")
    description: Optional[str] = Field(default=None, description="Field semantic description")
    semantic_representation: Optional[Dict[str, Any]] = Field(default=None, description="Compiled semantic representation of the field")

FieldDefinition.model_rebuild()

class ParsedRequest(BaseModel):
    requested_fields: List[FieldDefinition] = Field(..., description="List of target fields parsed from request")
    raw_request: str = Field(..., description="Original natural language request prompt")
    document_type_hint: Optional[str] = Field(default=None, description="Inferred or hinted document type")

from pydantic import model_validator

class UserStructuringRequest(BaseModel):
    document_id: Optional[str] = Field(default=None, description="Persisted raw artifact document ID e.g. 'doc_20260903_001'")
    raw_file_id: Optional[str] = Field(default=None, description="Alternative alias for document_id")
    artifact_path: Optional[str] = Field(default=None, description="Explicit path to persisted artifact file")
    raw_extraction: Optional[Union[RawExtractionInput, str]] = Field(default=None, description="In-memory raw extraction (retained for backward compatibility)")
    user_request: Optional[str] = Field(default=None, max_length=1000, description="Natural language request string")
    user_schema: Optional[List[Dict[str, Any]]] = Field(default=None, description="Optional dynamic user-defined schema")
    schema_definition: Optional[Union[Dict[str, Any], List[Dict[str, Any]]]] = Field(default=None, alias="schema", description="Alternative schema payload")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Optional payload metadata")

    @model_validator(mode="before")
    @classmethod
    def validate_request_inputs(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Map raw_file_id to document_id if provided
            if not data.get("document_id") and data.get("raw_file_id"):
                data["document_id"] = data["raw_file_id"]

            # Map schema to user_schema if list, or normalize if dict
            if "schema" in data and data["schema"] is not None and not data.get("user_schema"):
                s = data["schema"]
                if isinstance(s, dict) and "fields" in s:
                    # Convert ["f1", "f2"] to [{"name": "f1"}, {"name": "f2"}]
                    fields_list = s["fields"]
                    normalized = []
                    for f in fields_list:
                        if isinstance(f, str):
                            normalized.append({"name": f, "type": "string"})
                        elif isinstance(f, dict):
                            normalized.append(f)
                    data["user_schema"] = normalized
                elif isinstance(s, list):
                    data["user_schema"] = s

            # Verify document source is provided
            has_doc = bool(data.get("document_id") or data.get("artifact_path") or data.get("raw_extraction"))
            if not has_doc:
                raise ValueError("Must provide either 'document_id', 'artifact_path', or 'raw_extraction'.")

            # Verify request or schema is provided
            has_req = bool(data.get("user_request") or data.get("user_schema") or data.get("schema"))
            if not has_req:
                raise ValueError("Must provide either 'user_request' string or 'user_schema'/'schema'.")
        return data
