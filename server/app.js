import express from 'express';
import cors from 'cors';
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const PORT = process.env.PORT || 8787;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:dev123@home.whiteds.net:15432/postgres';
const TABLE = process.env.TABLE || 'scores';

const app = express();
app.use(cors());
app.use(express.json());

const pool = new pg.Pool({ connectionString: DATABASE_URL });
async function connect() {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS ${TABLE} (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      score INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`);
    await client.query(`CREATE INDEX IF NOT EXISTS ${TABLE}_score_created_at_idx ON ${TABLE} (score DESC, created_at DESC);`);
  } finally {
    client.release();
  }
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.get('/scores', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit ?? '10'), 10) || 10, 100);
    const { rows } = await pool.query(`SELECT name, score, created_at FROM ${TABLE} ORDER BY score DESC, created_at DESC LIMIT $1`, [limit]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed_to_list' });
  }
});

app.post('/scores', async (req, res) => {
  try {
    const { name, score } = req.body ?? {};
    const safeName = String(name ?? '').trim().slice(0, 40) || 'Anonymous';
    const safeScore = Number.isFinite(Number(score)) ? Math.max(0, Math.floor(Number(score))) : 0;
    const { rows } = await pool.query(`INSERT INTO ${TABLE} (name, score) VALUES ($1, $2) RETURNING id, name, score, created_at`, [safeName, safeScore]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'failed_to_insert' });
  }
});

connect().then(() => {
  app.listen(PORT, () => console.log(`Score server listening on ${PORT}`));
}).catch(err => {
  console.error('Failed to connect to Postgres', err);
  process.exit(1);
});
