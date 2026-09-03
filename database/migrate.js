const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Pool } = require('pg');

async function runMigrations() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'idp_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres_dev_password',
  });

  try {
    console.log('Connecting to PostgreSQL database...');
    const client = await pool.connect();
    
    console.log('Running migration: 001_initial_schema.sql');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'migrations', '001_initial_schema.sql'), 'utf8');
    await client.query(schemaSql);
    console.log('Schema migration 001 applied successfully.');

    console.log('Running migration: 002_stage2_dynamic_profiles.sql');
    const stage2Sql = fs.readFileSync(path.join(__dirname, 'migrations', '002_stage2_dynamic_profiles.sql'), 'utf8');
    await client.query(stage2Sql);
    console.log('Schema migration 002 applied successfully.');

    console.log('Running migration: 003_stage3_ingestion_schema.sql');
    const stage3Sql = fs.readFileSync(path.join(__dirname, 'migrations', '003_stage3_ingestion_schema.sql'), 'utf8');
    await client.query(stage3Sql);
    console.log('Schema migration 003 applied successfully.');

    console.log('Running migration: 004_stage4_classifier_schema.sql');
    const stage4Sql = fs.readFileSync(path.join(__dirname, 'migrations', '004_stage4_classifier_schema.sql'), 'utf8');
    await client.query(stage4Sql);
    console.log('Schema migration 004 applied successfully.');

    console.log('Running migration: 005_stage5_human_review_schema.sql');
    const stage5Sql = fs.readFileSync(path.join(__dirname, 'migrations', '005_stage5_human_review_schema.sql'), 'utf8');
    await client.query(stage5Sql);
    console.log('Schema migration 005 applied successfully.');

    console.log('Running migration: 006_stage6_structured_search.sql');
    const stage6Sql = fs.readFileSync(path.join(__dirname, 'migrations', '006_stage6_structured_search.sql'), 'utf8');
    await client.query(stage6Sql);
    console.log('Schema migration 006 applied successfully.');

    console.log('Running migration: 007_stage7_ai_chat_schema.sql');
    const stage7Sql = fs.readFileSync(path.join(__dirname, 'migrations', '007_stage7_ai_chat_schema.sql'), 'utf8');
    await client.query(stage7Sql);
    console.log('Schema migration 007 applied successfully.');

    console.log('Running migration: 008_stage8_exports_reporting.sql');
    const stage8Sql = fs.readFileSync(path.join(__dirname, 'migrations', '008_stage8_exports_reporting.sql'), 'utf8');
    await client.query(stage8Sql);
    console.log('Schema migration 008 applied successfully.');

    console.log('Running migration: 009_stage9_living_schema.sql');
    const stage9Sql = fs.readFileSync(path.join(__dirname, 'migrations', '009_stage9_living_schema.sql'), 'utf8');
    await client.query(stage9Sql);
    console.log('Schema migration 009 applied successfully.');

    console.log('Running migration: 010_multi_format_ingestion.sql');
    const stage10Sql = fs.readFileSync(path.join(__dirname, 'migrations', '010_multi_format_ingestion.sql'), 'utf8');
    await client.query(stage10Sql);
    console.log('Schema migration 010 applied successfully.');

    console.log('Running seed: 001_seed_data.sql');
    const seedSql = fs.readFileSync(path.join(__dirname, 'seed', '001_seed_data.sql'), 'utf8');
    await client.query(seedSql);
    console.log('Seed data applied successfully.');

    client.release();
  } catch (err) {
    console.error('Database migration error:', err.message);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
