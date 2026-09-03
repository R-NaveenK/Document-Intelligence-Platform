-- Migration 006: Structured Data Storage and Full-Text Search Schema (Stage 6)

-- Create structured_records table
CREATE TABLE IF NOT EXISTS structured_records (
    structured_record_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES processing_profiles(id) ON DELETE CASCADE,
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
    schema_version_id UUID NOT NULL REFERENCES schema_versions(id) ON DELETE CASCADE,
    processing_job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
    search_vector tsvector,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Extend field_values table with typed columns & evidence traceability
ALTER TABLE field_values
  ADD COLUMN IF NOT EXISTS structured_record_id UUID REFERENCES structured_records(structured_record_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS field_definition_id UUID REFERENCES field_definitions(id),
  ADD COLUMN IF NOT EXISTS data_type VARCHAR(50) DEFAULT 'string',
  ADD COLUMN IF NOT EXISTS value_text TEXT,
  ADD COLUMN IF NOT EXISTS value_integer BIGINT,
  ADD COLUMN IF NOT EXISTS value_decimal NUMERIC(18, 4),
  ADD COLUMN IF NOT EXISTS value_date DATE,
  ADD COLUMN IF NOT EXISTS value_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS value_boolean BOOLEAN,
  ADD COLUMN IF NOT EXISTS page_number INT,
  ADD COLUMN IF NOT EXISTS bounding_box JSONB,
  ADD COLUMN IF NOT EXISTS source_text TEXT,
  ADD COLUMN IF NOT EXISTS extraction_evidence JSONB;

-- Extend validation_results table for historical validation persistence
ALTER TABLE validation_results
  ADD COLUMN IF NOT EXISTS structured_record_id UUID REFERENCES structured_records(structured_record_id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS validated_value_snapshot TEXT;

-- Indexes for performance querying & full-text search
CREATE INDEX IF NOT EXISTS idx_structured_records_org_status ON structured_records(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_structured_records_profile_type ON structured_records(profile_id, document_type_id);
CREATE INDEX IF NOT EXISTS idx_structured_records_search ON structured_records USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_field_values_record ON field_values(structured_record_id);
CREATE INDEX IF NOT EXISTS idx_field_values_typed_int ON field_values(field_definition_id, value_integer);
CREATE INDEX IF NOT EXISTS idx_field_values_typed_dec ON field_values(field_definition_id, value_decimal);
CREATE INDEX IF NOT EXISTS idx_field_values_typed_date ON field_values(field_definition_id, value_date);
