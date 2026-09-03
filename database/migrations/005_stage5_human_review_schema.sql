-- Migration 005: Human Review Workflow Schema (Stage 5)

-- Create review_items table
CREATE TABLE IF NOT EXISTS review_items (
    review_item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    logical_document_id UUID REFERENCES logical_documents(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    review_type VARCHAR(50) NOT NULL,
    review_reason VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    priority VARCHAR(20) DEFAULT 'MEDIUM',
    assigned_to UUID REFERENCES users(id),
    source_page INT,
    source_field_key VARCHAR(100),
    original_value TEXT,
    corrected_value TEXT,
    confidence NUMERIC(5, 4),
    row_version INT NOT NULL DEFAULT 1,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ
);

-- Extend field_values table for machine vs human vs effective values
ALTER TABLE field_values
  ADD COLUMN IF NOT EXISTS machine_value TEXT,
  ADD COLUMN IF NOT EXISTS human_value TEXT,
  ADD COLUMN IF NOT EXISTS effective_value TEXT,
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(50) DEFAULT 'UNREVIEWED';

-- Extend document_classifications table for machine vs human reviewed classification
ALTER TABLE document_classifications
  ADD COLUMN IF NOT EXISTS machine_document_type_id UUID REFERENCES document_types(id),
  ADD COLUMN IF NOT EXISTS reviewed_document_type_id UUID REFERENCES document_types(id);

-- Indexes for review queue querying
CREATE INDEX IF NOT EXISTS idx_review_items_org_status ON review_items(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_review_items_job ON review_items(job_id);
CREATE INDEX IF NOT EXISTS idx_review_items_doc ON review_items(document_id);
