-- Seed Data for Intelligent Document Processing Platform

INSERT INTO organizations (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Acme Corporation', 'acme-corp')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO users (id, organization_id, email, full_name, role)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000001',
    'admin@acme.com',
    'Acme Admin',
    'ADMIN'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO processing_profiles (id, organization_id, name, description)
VALUES (
    '00000000-0000-0000-0000-000000000003',
    '00000000-0000-0000-0000-000000000001',
    'Default Financial Ingestion Profile',
    'Standard processing profile for financial invoices and receipts'
) ON CONFLICT DO NOTHING;

INSERT INTO schema_versions (id, profile_id, version_number, schema_config)
VALUES (
    '00000000-0000-0000-0000-000000000004',
    '00000000-0000-0000-0000-000000000003',
    1,
    '{"extractTables": true, "ocrEngine": "tesseract", "confidenceThreshold": 0.85}'
) ON CONFLICT DO NOTHING;

INSERT INTO document_types (id, organization_id, code, name, description)
VALUES (
    '00000000-0000-0000-0000-000000000005',
    '00000000-0000-0000-0000-000000000001',
    'INVOICE',
    'Commercial Invoice',
    'Standard vendor commercial invoice document'
) ON CONFLICT DO NOTHING;

INSERT INTO field_definitions (document_type_id, field_key, display_name, data_type, is_required)
VALUES 
    ('00000000-0000-0000-0000-000000000005', 'invoice_number', 'Invoice Number', 'string', true),
    ('00000000-0000-0000-0000-000000000005', 'total_amount', 'Total Amount', 'number', true),
    ('00000000-0000-0000-0000-000000000005', 'invoice_date', 'Invoice Date', 'date', true)
ON CONFLICT DO NOTHING;
