from typing import Type, Dict, Any, Optional, List, Union, Tuple
from pydantic import create_model, BaseModel, Field
from app.models.user_request import ParsedRequest, FieldDefinition
from app.schema_builder.base import BaseSchemaBuilder
from app.core.exceptions import SchemaGenerationError
from app.core.logging_config import logger

from functools import lru_cache

class SchemaBuilder(BaseSchemaBuilder):
    """Dynamic Schema Builder generating typed Pydantic models & JSON Schemas from ParsedRequest."""

    def build_pydantic_model(self, parsed_request: ParsedRequest) -> Type[BaseModel]:
        try:
            # Build cache key from requested fields signature
            cache_key = tuple(
                (f.key, f.data_type, f.is_list, tuple((nf.key, nf.data_type) for nf in (f.nested_fields or [])))
                for f in parsed_request.requested_fields
            )
            return self._build_cached_model(cache_key, parsed_request)
        except Exception as e:
            raise SchemaGenerationError(f"Failed to generate dynamic Pydantic schema: {str(e)}") from e

    def _build_cached_model(self, cache_key: Tuple[Any, ...], parsed_request: ParsedRequest) -> Type[BaseModel]:
        field_definitions = {}
        for field in parsed_request.requested_fields:
            key = field.key
            field_type, default_val = self._map_field_type(field)
            field_definitions[key] = (field_type, default_val)

        dynamic_model = create_model(
            "DynamicDocumentSchema",
            __base__=BaseModel,
            **field_definitions
        )
        logger.info(f"Dynamically generated Pydantic schema with {len(field_definitions)} fields")
        return dynamic_model

    def build_json_schema(self, pydantic_model: Type[BaseModel]) -> Dict[str, Any]:
        try:
            return pydantic_model.model_json_schema()
        except Exception as e:
            raise SchemaGenerationError(f"Failed to generate JSON Schema: {str(e)}") from e

    def _map_field_type(self, field: FieldDefinition) -> Tuple[Any, Any]:
        if field.is_list and field.nested_fields:
            nested_fields_dict = {}
            for nf in field.nested_fields:
                nested_type, nested_def = self._map_primitive_type(nf.data_type)
                nested_fields_dict[nf.key] = (nested_type, nested_def)
            
            nested_item_model = create_model(
                f"{field.key.title().replace('_', '')}Item",
                __base__=BaseModel,
                **nested_fields_dict
            )
            return Optional[List[nested_item_model]], Field(default_factory=list)
        else:
            return self._map_primitive_type(field.data_type)

    def _map_primitive_type(self, data_type: str) -> Tuple[Any, Any]:
        if data_type in ["number", "float", "integer"]:
            return Optional[Union[float, int, str]], None
        else:
            return Optional[str], None
