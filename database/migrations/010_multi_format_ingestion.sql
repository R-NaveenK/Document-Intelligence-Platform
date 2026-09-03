-- Migration 010: Multi-Format & Batch Upload Ingestion Extension Schema

-- Create upload_batches table
CREATE TABLE IF NOT EXISTS upload_batches (
    batch_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES processing_profiles(id) ON DELETE CASCADE,
    schema_version_id UUID REFERENCES schema_versions(id),
    created_by UUID REFERENCES users(id),
    total_files INT DEFAULT 0,
    completed_files INT DEFAULT 0,
    failed_files INT DEFAULT 0,
    review_required_files INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Extend documents table with batch and source format tracking
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS batch_id UUID REFERENCES upload_batches(batch_id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_format VARCHAR(50) DEFAULT 'PDF',
  ADD COLUMN IF NOT EXISTS logical_units JSONB;

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_documents_batch ON documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_upload_batches_org ON upload_batches(organization_id, created_at);
