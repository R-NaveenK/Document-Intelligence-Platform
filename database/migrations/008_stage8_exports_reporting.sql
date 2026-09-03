-- Migration 008: Export & Reporting Schema (Stage 8)

-- Create export_jobs table
CREATE TABLE IF NOT EXISTS export_jobs (
    export_job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by UUID REFERENCES users(id),
    format VARCHAR(20) NOT NULL,
    profile_id UUID REFERENCES processing_profiles(id),
    document_type_id UUID REFERENCES document_types(id),
    request_config JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    record_count INT DEFAULT 0,
    storage_key VARCHAR(500),
    filename VARCHAR(255),
    file_size BIGINT DEFAULT 0,
    error_message TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

-- Indexes for performance querying
CREATE INDEX IF NOT EXISTS idx_export_jobs_org ON export_jobs(organization_id, created_at);
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON export_jobs(status);
