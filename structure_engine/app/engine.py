import time
from pathlib import Path
from typing import Dict, Any, Optional, Union, List
from app.models.extraction_input import RawExtractionInput
from app.models.user_request import ParsedRequest
from app.models.structuring_output import StructuringResponse
from app.request_parser.parser import RequestParser
from app.schema_builder.builder import SchemaBuilder
from app.candidate_finder.finder import CandidateFinder
from app.field_extractor.extractor import FieldExtractor
from app.output_generator.generator import StructuredOutputGenerator
from app.formatter.formatter import OutputFormatter
from app.core.exceptions import StructuringEngineException, InvalidInputError
from app.core.logging_config import logger

from app.semantic.schema_adapter import DynamicSchemaAdapter
from app.input.raw_document_loader import RawDocumentLoader

class StructuringEngine:
    """Unified Facade for the Structuring Layer connecting all 6 pipeline components."""

    def __init__(self, raw_loader_base_dir: Optional[str] = None):
        self.parser = RequestParser()
        self.schema_builder = SchemaBuilder()
        self.candidate_finder = CandidateFinder()
        self.field_extractor = FieldExtractor()
        self.output_generator = StructuredOutputGenerator()
        self.formatter = OutputFormatter()
        self.schema_adapter = DynamicSchemaAdapter()
        self.raw_document_loader = RawDocumentLoader(base_dir=raw_loader_base_dir)
        logger.info("StructuringEngine initialized with 6 core pipeline components, semantic field engine, and RawDocumentLoader.")

    def structure(
        self,
        raw_extraction: Optional[Union[RawExtractionInput, Dict[str, Any], str]] = None,
        user_request: Optional[str] = None,
        user_schema: Optional[Union[List[Dict[str, Any]], Dict[str, Any]]] = None,
        document_id: Optional[str] = None,
        artifact_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> StructuringResponse:
        start_time = time.perf_counter()
        
        # 0. Sanitize and validate input parameters
        if (not user_request or not user_request.strip()) and not user_schema:
            raise InvalidInputError("Either user_request string or user_schema must be provided.")

        # Normalize schema if passed as {"fields": [...]}
        if isinstance(user_schema, dict) and "fields" in user_schema:
            fields_val = user_schema["fields"]
            normalized_fields = []
            for f in fields_val:
                if isinstance(f, str):
                    normalized_fields.append({"name": f, "type": "string"})
                elif isinstance(f, dict):
                    normalized_fields.append(f)
            user_schema = normalized_fields

        # Auto-detect if document_id is an explicit file path on disk
        if document_id:
            cleaned_doc = str(document_id).strip().strip('"').strip("'")
            if (Path(cleaned_doc).is_file() or cleaned_doc.endswith(".txt") or cleaned_doc.endswith(".json")) and (":" in cleaned_doc or "\\" in cleaned_doc or "/" in cleaned_doc) and not artifact_path:
                artifact_path = cleaned_doc
                document_id = None
            else:
                document_id = cleaned_doc
        if artifact_path:
            artifact_path = str(artifact_path).strip().strip('"').strip("'")

        # Determine raw extraction source: disk artifact vs in-memory payload
        parsed_raw_input: RawExtractionInput
        if raw_extraction is None:
            if not document_id and not artifact_path:
                raise InvalidInputError("Either document_id, artifact_path, or raw_extraction must be provided.")
            parsed_raw_input = self.raw_document_loader.load(document_id=document_id, artifact_path=artifact_path)
            doc_id = parsed_raw_input.document_id or document_id or (Path(artifact_path).stem if artifact_path else "DOC_UNKNOWN")
        else:
            # Check if raw_extraction is a short document_id or file reference rather than document body
            if isinstance(raw_extraction, str) and "\n" not in raw_extraction and len(raw_extraction) < 120 and self.raw_document_loader.exists(raw_extraction):
                parsed_raw_input = self.raw_document_loader.load(document_id=raw_extraction)
                doc_id = parsed_raw_input.document_id or raw_extraction
            else:
                parsed_raw_input = self._normalize_raw_input(raw_extraction, document_id, metadata)
                doc_id = parsed_raw_input.document_id or document_id or "DOC_UNKNOWN"

        req_log = user_request if user_request else f"Custom Schema with {len(user_schema) if isinstance(user_schema, list) else len(user_schema.keys())} fields"
        logger.info(f"Starting structuring pipeline for doc '{doc_id}' with request: '{req_log}'")

        # Step 1: REQUEST PARSER & SEMANTIC ADAPTER
        if user_schema:
            parsed_req: ParsedRequest = self.schema_adapter.adapt_schema(user_schema, prompt_hint=user_request or "")
        else:
            parsed_req: ParsedRequest = self.parser.parse(user_request)

        # Step 2: SCHEMA BUILDER
        pydantic_schema_model = self.schema_builder.build_pydantic_model(parsed_req)

        # Step 3: CANDIDATE FINDER
        candidate_map = self.candidate_finder.find_candidates(
            raw_text=parsed_raw_input.raw_text,
            parsed_request=parsed_req
        )

        # Step 4: FIELD EXTRACTOR
        extraction_results = self.field_extractor.extract_fields(
            raw_text=parsed_raw_input.raw_text,
            candidate_map=candidate_map,
            parsed_request=parsed_req
        )

        # Step 5: STRUCTURED OUTPUT GENERATOR
        structured_model_instance = self.output_generator.generate(
            extracted_fields=extraction_results,
            schema_model=pydantic_schema_model
        )

        # Step 6: OUTPUT FORMATTER
        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        response = self.formatter.format_response(
            document_id=doc_id,
            structured_data_model=structured_model_instance,
            field_extraction_results=extraction_results,
            processing_time_ms=elapsed_ms
        )

        return response

    def _normalize_raw_input(
        self,
        raw_extraction: Union[RawExtractionInput, Dict[str, Any], str],
        document_id: Optional[str],
        metadata: Optional[Dict[str, Any]]
    ) -> RawExtractionInput:
        if isinstance(raw_extraction, RawExtractionInput):
            return raw_extraction
        elif isinstance(raw_extraction, dict):
            return RawExtractionInput(
                document_id=raw_extraction.get("document_id", document_id or "DOC_UNKNOWN"),
                raw_text=raw_extraction.get("raw_text", ""),
                pages=raw_extraction.get("pages", []),
                extraction_confidence=raw_extraction.get("extraction_confidence", 1.0),
                metadata=raw_extraction.get("metadata", metadata or {})
            )
        elif isinstance(raw_extraction, str):
            return RawExtractionInput(
                document_id=document_id or "DOC_UNKNOWN",
                raw_text=raw_extraction,
                metadata=metadata or {}
            )
        else:
            raise InvalidInputError(f"Unsupported raw extraction input type: {type(raw_extraction)}")
