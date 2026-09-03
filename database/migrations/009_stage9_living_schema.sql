-- Migration 009: Living Schema / Custom Field Reprocessing Schema (Stage 9)

-- Create reprocessing_jobs table
CREATE TABLE IF NOT EXISTS reprocessing_jobs (
    reprocessing_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES processing_profiles(id) ON DELETE CASCADE,
    source_schema_version_id UUID REFERENCES schema_versions(id),
    target_schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
    created_by UUID REFERENCES users(id),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    total_records INT DEFAULT 0,
    processed_records INT DEFAULT 0,
    successful_records INT DEFAULT 0,
    review_required_records INT DEFAULT 0,
    failed_records INT DEFAULT 0,
    request_config JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

-- Create reprocessing_items table
CREATE TABLE IF NOT EXISTS reprocessing_items (
    reprocessing_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reprocessing_job_id UUID NOT NULL REFERENCES reprocessing_jobs(reprocessing_job_id) ON DELETE CASCADE,
    structured_record_id UUID NOT NULL REFERENCES structured_records(structured_record_id) ON DELETE CASCADE,
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    document_type_id UUID NOT NULL REFERENCES document_types(id),
    field_definition_id UUID REFERENCES field_definitions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    attempt_count INT DEFAULT 1,
    error_code VARCHAR(100),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Extend field_values table with provenance metadata
ALTER TABLE field_values
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'ORIGINAL_PROCESSING',
  ADD COLUMN IF NOT EXISTS source_reprocessing_job_id UUID REFERENCES reprocessing_jobs(reprocessing_job_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS schema_version_id UUID REFERENCES schema_versions(id);

-- Extend structured_records table with versioning tracking
ALTER TABLE structured_records
  ADD COLUMN IF NOT EXISTS original_schema_version_id UUID REFERENCES schema_versions(id),
  ADD COLUMN IF NOT EXISTS current_enrichment_schema_version_id UUID REFERENCES schema_versions(id);

-- Indexes for performance querying
CREATE INDEX IF NOT EXISTS idx_reprocessing_jobs_org ON reprocessing_jobs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_reprocessing_items_job ON reprocessing_items(reprocessing_job_id, status);
CREATE INDEX IF NOT EXISTS idx_field_values_provenance ON field_values(structured_record_id, field_definition_id, schema_version_id);
