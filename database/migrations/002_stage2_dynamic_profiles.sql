-- Migration 002: Dynamic Document Profiles and Custom Fields (Stage 2)

-- Extend processing_profiles table
ALTER TABLE processing_profiles 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS current_schema_version_id UUID,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Extend schema_versions table
ALTER TABLE schema_versions 
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'DRAFT',
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Extend document_types table
ALTER TABLE document_types 
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES processing_profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS schema_version_id UUID REFERENCES schema_versions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS key VARCHAR(100),
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Update key column for existing document_types if any
UPDATE document_types SET key = LOWER(code) WHERE key IS NULL;

-- Extend field_definitions table
ALTER TABLE field_definitions 
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS is_multiple BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS display_order INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Extend audit_events table
ALTER TABLE audit_events
  ADD COLUMN IF NOT EXISTS action VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entity_id UUID;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_processing_profiles_org ON processing_profiles(organization_id);
CREATE INDEX IF NOT EXISTS idx_document_types_profile ON document_types(profile_id);
CREATE INDEX IF NOT EXISTS idx_document_types_schema ON document_types(schema_version_id);
CREATE INDEX IF NOT EXISTS idx_field_definitions_doc_type ON field_definitions(document_type_id);
