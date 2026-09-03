-- Migration 004: Hybrid Document Classifier and Page Grouping Schema (Stage 4)

-- Extend document_classifications table
ALTER TABLE document_classifications
  ADD COLUMN IF NOT EXISTS page_number INT,
  ADD COLUMN IF NOT EXISTS classification_method VARCHAR(50) DEFAULT 'RULES',
  ADD COLUMN IF NOT EXISTS boundary_type VARCHAR(50) DEFAULT 'STARTS_NEW_DOCUMENT',
  ADD COLUMN IF NOT EXISTS review_reason VARCHAR(100),
  ADD COLUMN IF NOT EXISTS scores_json JSONB DEFAULT '{}';

-- Extend logical_documents table
ALTER TABLE logical_documents
  ADD COLUMN IF NOT EXISTS requires_review BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_reason VARCHAR(100);

-- Indexes for performance querying by job, logical document, and review status
CREATE INDEX IF NOT EXISTS idx_document_classifications_job ON document_classifications(job_id);
CREATE INDEX IF NOT EXISTS idx_document_classifications_logical_doc ON document_classifications(logical_document_id);
CREATE INDEX IF NOT EXISTS idx_logical_documents_doc ON logical_documents(document_id);
