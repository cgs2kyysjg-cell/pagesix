import express from 'express';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT           = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const DATABASE_URL   = process.env.DATABASE_URL;

if (!ADMIN_PASSWORD) {
  console.warn('[warn] ADMIN_PASSWORD not set — admin endpoint will be locked.');
}
if (!DATABASE_URL) {
  console.error('[error] DATABASE_URL not set. Link a Render Postgres database.');
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: DATABASE_URL ? { rejectUnauthorized: false } : false
});

async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tips (
      id BIGSERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      section TEXT,
      headline TEXT NOT NULL,
      summary TEXT,
      byline TEXT
    )
  `);
  console.log('[db] ready');
}

function trimOrNull(s, max) {
  if (s == null) return null;
  const str = String(s).trim();
  return str ? str.slice(0, max) : null;
}

const app = express();
app.use(express.json({ limit: '20kb' }));
app.use(express.static(__dirname));

// --- Public submission endpoint --------------------------------------------
app.post('/api/tips', async (req, res) => {
  try {
    const { section, headline, summary, byline } = req.body || {};
    const cleanHeadline = trimOrNull(headline, 280);
    if (!cleanHeadline) return res.status(400).json({ error: 'headline required' });
    await pool.query(
      'INSERT INTO tips (section, headline, summary, byline) VALUES ($1, $2, $3, $4)',
      [
        trimOrNull(section, 60),
        cleanHeadline,
        trimOrNull(summary, 600),
        trimOrNull(byline, 100) || 'By Anonymous'
      ]
    );
    res.json({ ok: true });
  } catch (e) {
    console.error('[insert]', e);
    res.status(500).json({ error: 'insert failed' });
  }
});

// --- Admin auth ------------------------------------------------------------
function checkAdmin(req) {
  if (!ADMIN_PASSWORD) return false;
  const auth = req.headers['authorization'] || '';
  if (!auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === ADMIN_PASSWORD;
}

app.post('/api/admin/login', (req, res) => {
  if (!ADMIN_PASSWORD) return res.status(503).json({ error: 'admin password not configured' });
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) return res.json({ ok: true, token: ADMIN_PASSWORD });
  return res.status(401).json({ ok: false });
});

app.get('/api/admin/tips', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const { rows } = await pool.query('SELECT * FROM tips ORDER BY created_at DESC');
    res.json({ tips: rows });
  } catch (e) {
    console.error('[select]', e);
    res.status(500).json({ error: 'select failed' });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// --- Boot ------------------------------------------------------------------
initDb()
  .then(() => app.listen(PORT, () => console.log(`[boot] listening on ${PORT}`)))
  .catch(err => { console.error('[boot] failed', err); process.exit(1); });
