import pg from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:dev123@home.whiteds.net:15432/postgres';
const TABLE = process.env.TABLE || 'scores';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    await client.query(`CREATE INDEX IF NOT EXISTS ${TABLE}_score_created_at_idx ON ${TABLE} (score DESC, created_at DESC);`);
    console.log('DB initialized:', { TABLE });
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
