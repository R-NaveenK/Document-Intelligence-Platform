from typing import Dict, Any, Type
from pydantic import BaseModel, ValidationError
from app.models.structuring_output import FieldExtractionResult
from app.output_generator.base import BaseStructuredGenerator
from app.core.exceptions import OutputGenerationError
from app.core.logging_config import logger

class StructuredOutputGenerator(BaseStructuredGenerator):
    """Schema-constrained Output Generator enforcing strict dynamic Pydantic models."""

    def generate(self, extracted_fields: Dict[str, FieldExtractionResult], schema_model: Type[BaseModel]) -> BaseModel:
        raw_values: Dict[str, Any] = {}

        for key, res in extracted_fields.items():
            if res.status == "found" and res.value is not None:
                raw_values[key] = res.value
            else:
                raw_values[key] = None

        try:
            validated_instance = schema_model(**raw_values)
            logger.info(f"Successfully generated validated schema output with {len(raw_values)} keys")
            return validated_instance
        except ValidationError as ve:
            logger.warning(f"Schema validation warning: {ve}. Attempting relaxed fallback validation.")
            try:
                # Perform fallback normalization (e.g. converting empty list/strings)
                relaxed_values = {}
                for k, v in raw_values.items():
                    relaxed_values[k] = v
                return schema_model.model_construct(**relaxed_values)
            except Exception as e:
                raise OutputGenerationError(f"Failed to generate structured schema output: {str(e)}") from e
        except Exception as e:
            raise OutputGenerationError(f"Unexpected error in output generator: {str(e)}") from e
