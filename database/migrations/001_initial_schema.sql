-- Migration 001: Initial Schema for Intelligent Document Processing Platform

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'USER',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Processing Profiles
CREATE TABLE IF NOT EXISTS processing_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Schema Versions
CREATE TABLE IF NOT EXISTS schema_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES processing_profiles(id) ON DELETE CASCADE,
    version_number INT NOT NULL,
    schema_config JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(profile_id, version_number)
);

-- Document Types
CREATE TABLE IF NOT EXISTS document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code VARCHAR(100) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(organization_id, code)
);

-- Field Definitions
CREATE TABLE IF NOT EXISTS field_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type_id UUID NOT NULL REFERENCES document_types(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    data_type VARCHAR(50) NOT NULL,
    is_required BOOLEAN DEFAULT FALSE,
    validation_rules JSONB DEFAULT '{}',
    UNIQUE(document_type_id, field_key)
);

-- Documents (FILE level representation)
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    original_filename VARCHAR(255) NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    file_size BIGINT NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    page_count INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'UPLOADED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Document Pages (PAGE level representation)
CREATE TABLE IF NOT EXISTS document_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INT NOT NULL,
    raw_text TEXT,
    ocr_confidence NUMERIC(5, 4),
    tsv_text TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(raw_text, ''))) STORED,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(document_id, page_number)
);

-- Logical Documents (LOGICAL DOCUMENT representation across/within a file)
CREATE TABLE IF NOT EXISTS logical_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    document_type_id UUID REFERENCES document_types(id),
    confidence NUMERIC(5, 4),
    status VARCHAR(50) DEFAULT 'CREATED',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Logical Document Pages Mapping
CREATE TABLE IF NOT EXISTS logical_document_pages (
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    document_page_id UUID NOT NULL REFERENCES document_pages(id) ON DELETE CASCADE,
    page_sequence INT NOT NULL,
    PRIMARY KEY(logical_document_id, document_page_id)
);

-- Processing Jobs
CREATE TABLE IF NOT EXISTS processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES processing_profiles(id),
    schema_version_id UUID NOT NULL REFERENCES schema_versions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'QUEUED',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Processing Steps
CREATE TABLE IF NOT EXISTS processing_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    step_name VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,
    input_payload JSONB,
    output_payload JSONB,
    duration_ms INT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Document Classifications
CREATE TABLE IF NOT EXISTS document_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES processing_jobs(id) ON DELETE CASCADE,
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    document_type_id UUID REFERENCES document_types(id),
    confidence NUMERIC(5, 4),
    requires_review BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Field Values
CREATE TABLE IF NOT EXISTS field_values (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    value TEXT,
    normalized_value TEXT,
    confidence NUMERIC(5, 4),
    page_number INT,
    bounding_box JSONB,
    source_text TEXT,
    tsv_value TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(value, ''))) STORED,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Validation Results
CREATE TABLE IF NOT EXISTS validation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    validation_type VARCHAR(50) NOT NULL,
    field_key VARCHAR(100),
    passed BOOLEAN NOT NULL,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Review Actions
CREATE TABLE IF NOT EXISTS review_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    logical_document_id UUID NOT NULL REFERENCES logical_documents(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL,
    changes JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Audit Events
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id),
    event_type VARCHAR(100) NOT NULL,
    details JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for Full Text Search & Trigram Search
CREATE INDEX IF NOT EXISTS idx_document_pages_tsv ON document_pages USING GIN(tsv_text);
CREATE INDEX IF NOT EXISTS idx_field_values_tsv ON field_values USING GIN(tsv_value);
CREATE INDEX IF NOT EXISTS idx_field_values_trgm ON field_values USING GIN(value gin_trgm_ops);
