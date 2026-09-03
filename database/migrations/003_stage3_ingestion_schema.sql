-- Migration 003: Document Upload and Ingestion Layer Schema (Stage 3)

-- Extend documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES processing_profiles(id),
  ADD COLUMN IF NOT EXISTS schema_version_id UUID REFERENCES schema_versions(id),
  ADD COLUMN IF NOT EXISTS checksum VARCHAR(64),
  ADD COLUMN IF NOT EXISTS storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS created_by UUID;

-- Index for per-organization duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_checksum ON documents(organization_id, checksum);

-- Extend processing_jobs table
ALTER TABLE processing_jobs
  ADD COLUMN IF NOT EXISTS retry_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS schema_version_id UUID REFERENCES schema_versions(id);

-- Extend processing_steps table
ALTER TABLE processing_steps
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Indexes for querying documents & jobs by organization and status
CREATE INDEX IF NOT EXISTS idx_documents_org_status ON documents(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_processing_jobs_org_status ON processing_jobs(organization_id, status);
