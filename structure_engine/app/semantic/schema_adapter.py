"""
Dynamic Schema Adapter
Converts dynamic user-defined schemas (from external services, other models, or API payloads)
into ParsedRequest instances equipped with complete FieldSemanticRepresentation objects.
"""

from typing import List, Dict, Any, Union
from app.models.user_request import ParsedRequest, FieldDefinition
from app.semantic.representation import SemanticConceptSpace

class DynamicSchemaAdapter:
    """Adapts user-defined schemas into standard ParsedRequest with semantic representation."""

    def __init__(self):
        self.concept_space = SemanticConceptSpace()

    def adapt_schema(self, raw_schema: Union[List[Dict[str, Any]], Dict[str, Any]], prompt_hint: str = "") -> ParsedRequest:
        """Adapts an external JSON schema or field list into a ParsedRequest with semantic models."""
        fields_list: List[Dict[str, Any]] = []
        if isinstance(raw_schema, dict):
            if "fields" in raw_schema and isinstance(raw_schema["fields"], list):
                fields_list = raw_schema["fields"]
            elif "properties" in raw_schema and isinstance(raw_schema["properties"], dict):
                for k, v in raw_schema["properties"].items():
                    fields_list.append({
                        "name": k,
                        "type": v.get("type", "string"),
                        "description": v.get("description")
                    })
            else:
                for k, v in raw_schema.items():
                    fields_list.append({
                        "name": k,
                        "type": v if isinstance(v, str) else "string"
                    })
        elif isinstance(raw_schema, list):
            fields_list = raw_schema

        parsed_fields: List[FieldDefinition] = []
        for item in fields_list:
            name = item.get("name") or item.get("key") or item.get("field") or "field"
            dtype = item.get("type", "string")
            desc = item.get("description")
            disp = item.get("display_name") or name.replace("_", " ").title()

            rep = self.concept_space.get_representation(
                field_name=name,
                display_name=disp,
                description=desc,
                data_type=dtype
            )

            field_def = FieldDefinition(
                key=name.lower().replace(" ", "_"),
                display_name=disp,
                data_type=rep.expected_type,
                description=desc,
                semantic_representation=rep.model_dump()
            )
            parsed_fields.append(field_def)

        return ParsedRequest(
            requested_fields=parsed_fields,
            raw_request=prompt_hint or "Dynamic user-defined schema request",
            document_type_hint=None
        )
