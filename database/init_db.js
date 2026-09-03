const { Client } = require('pg');

async function init() {
  const client = new Client({
    host: '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5433', 10),
    user: 'postgres',
    database: 'postgres'
  });

  try {
    await client.connect();
    console.log('Connected to postgres default DB on port', process.env.DB_PORT || '5433');
    try {
      await client.query('CREATE DATABASE idp_db');
      console.log('Created idp_db database');
    } catch (e) {
      console.log('idp_db status:', e.message);
    }
    await client.query("ALTER USER postgres WITH PASSWORD 'postgres_dev_password'");
    console.log('Postgres password set to postgres_dev_password');
    await client.end();
  } catch (err) {
    console.error('Init error:', err.message);
  }
}

if (require.main === module) {
  init();
}

module.exports = { init };
