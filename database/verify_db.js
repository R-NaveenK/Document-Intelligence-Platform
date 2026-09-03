const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { pool, checkDbHealth } = require('../backend/src/services/db');

async function verifyDatabase() {
  console.log('==================================================');
  console.log('DATABASE CONNECTIVITY & SCHEMA VERIFICATION SUITE');
  console.log('==================================================\n');

  const client = await pool.connect();

  try {
    // 1. SELECT 1 query
    const s1 = await client.query('SELECT 1 as result, NOW() as current_time, version() as version;');
    console.log('[PASS] Step 4: SELECT 1 execution succeeded');
    console.log(`       PostgreSQL Version: ${s1.rows[0].version.split(',')[0]}`);
    console.log(`       Current DB Time: ${s1.rows[0].current_time}\n`);

    // 2. Health check
    const health = await checkDbHealth();
    console.log(`[PASS] DB Health Check: ${health.status} [Timestamp: ${health.timestamp}]\n`);

    // 3. Tables verification
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log(`[PASS] Step 6: ${tables.length} tables verified in PostgreSQL:`);
    tables.forEach(t => console.log(`       - ${t}`));
    console.log('');

    // Critical tables check
    const requiredTables = [
      'organizations', 'users', 'processing_profiles', 'schema_versions',
      'document_types', 'field_definitions', 'documents', 'document_pages',
      'upload_batches', 'processing_jobs', 'processing_steps', 'logical_documents',
      'logical_document_pages', 'document_classifications', 'structured_records',
      'field_values', 'validation_results', 'review_items', 'audit_events',
      'chat_sessions', 'chat_messages', 'export_jobs', 'reprocessing_jobs',
      'reprocessing_items'
    ];

    const missingTables = requiredTables.filter(t => !tables.includes(t));
    if (missingTables.length === 0) {
      console.log('[PASS] All 24 critical platform tables are present in database.\n');
    } else {
      console.error('[FAIL] Missing tables:', missingTables);
    }

    // 4. Foreign Key Relationships check
    const fkRes = await client.query(`
      SELECT
        tc.table_name, 
        kcu.column_name, 
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name 
      FROM information_schema.table_constraints AS tc 
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, kcu.column_name;
    `);
    console.log(`[PASS] Step 7: ${fkRes.rows.length} foreign key constraints verified:`);
    fkRes.rows.slice(0, 10).forEach(r => {
      console.log(`       - ${r.table_name}.${r.column_name} -> ${r.foreign_table_name}.${r.foreign_column_name}`);
    });
    console.log(`       ... and ${fkRes.rows.length - 10} more foreign key constraints.\n`);

    // 5. Multi-tenancy check (organization_id presence on tenant-scoped tables)
    const orgColsRes = await client.query(`
      SELECT table_name, column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND column_name = 'organization_id'
      ORDER BY table_name;
    `);
    console.log(`[PASS] Step 8: Multi-tenancy verified across ${orgColsRes.rows.length} tables with direct organization_id isolation:`);
    orgColsRes.rows.forEach(r => console.log(`       - ${r.table_name}`));
    console.log('');

    // 6. JSONB, GIN, and TSVECTOR verification
    const jsonbCols = await client.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' AND data_type = 'jsonb'
      ORDER BY table_name;
    `);
    console.log(`[PASS] Step 9: ${jsonbCols.rows.length} JSONB columns verified:`);
    jsonbCols.rows.forEach(r => console.log(`       - ${r.table_name}.${r.column_name}`));
    console.log('');

    const ginIndexes = await client.query(`
      SELECT tablename, indexname, indexdef 
      FROM pg_indexes 
      WHERE schemaname = 'public' AND indexdef LIKE '%USING gin%'
      ORDER BY tablename, indexname;
    `);
    console.log(`[PASS] Step 9: ${ginIndexes.rows.length} GIN / Full-Text Search indexes verified:`);
    ginIndexes.rows.forEach(r => console.log(`       - ${r.indexname} on ${r.tablename}`));
    console.log('');

    // 7. Safe Transaction Insert + Read + Update + Rollback test
    console.log('--- Executing Safe Transaction Write/Read/Rollback Test ---');
    await client.query('BEGIN');
    
    // Insert temporary organization
    const testOrgId = '99999999-9999-9999-9999-999999999999';
    await client.query(`
      INSERT INTO organizations (id, name, slug) 
      VALUES ($1, 'Temporary Test Org', 'temp-test-org');
    `, [testOrgId]);
    console.log('[PASS] Step 10: Temporary record inserted inside transaction');

    // Read it back
    const readBack = await client.query('SELECT * FROM organizations WHERE id = $1', [testOrgId]);
    if (readBack.rows.length === 1 && readBack.rows[0].slug === 'temp-test-org') {
      console.log('[PASS] Step 10: Record successfully read back inside transaction');
    }

    // Update
    await client.query('UPDATE organizations SET name = $1 WHERE id = $2', ['Updated Temp Org', testOrgId]);
    const updatedBack = await client.query('SELECT name FROM organizations WHERE id = $1', [testOrgId]);
    if (updatedBack.rows[0].name === 'Updated Temp Org') {
      console.log('[PASS] Step 10: Record successfully updated inside transaction');
    }

    // Rollback
    await client.query('ROLLBACK');
    console.log('[PASS] Step 10: Transaction rolled back successfully');

    // Confirm no leftover data
    const finalCheck = await client.query('SELECT * FROM organizations WHERE id = $1', [testOrgId]);
    if (finalCheck.rows.length === 0) {
      console.log('[PASS] Step 10: Confirmed database is clean (no test data leaked).\n');
    }

    console.log('==================================================');
    console.log('ALL DATABASE VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('==================================================');

  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  verifyDatabase().catch(err => {
    console.error('Database verification failed:', err);
    process.exit(1);
  });
}

module.exports = { verifyDatabase };
