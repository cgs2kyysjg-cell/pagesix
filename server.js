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
  // Idempotent migration: add photo_data column for image submissions
  await pool.query(`ALTER TABLE tips ADD COLUMN IF NOT EXISTS photo_data TEXT`);
  console.log('[db] ready');
}

function trimOrNull(s, max) {
  if (s == null) return null;
  const str = String(s).trim();
  return str ? str.slice(0, max) : null;
}

const app = express();
app.use(express.json({ limit: '6mb' }));   // headlines are tiny; photos can push body size
app.use(express.static(__dirname));

// --- Public submission endpoint --------------------------------------------
app.post('/api/tips', async (req, res) => {
  try {
    const { section, headline, summary, byline, photo_data } = req.body || {};
    const cleanHeadline = trimOrNull(headline, 65);   // enforce 65-char headline limit server-side too
    if (!cleanHeadline) return res.status(400).json({ error: 'headline required' });

    // Photo: only accept data URLs that look like an image (and bound the length).
    let photo = null;
    if (typeof photo_data === 'string' && photo_data.startsWith('data:image/')) {
      photo = photo_data.length > 5 * 1024 * 1024 ? null : photo_data;
    }

    await pool.query(
      'INSERT INTO tips (section, headline, summary, byline, photo_data) VALUES ($1, $2, $3, $4, $5)',
      [
        trimOrNull(section, 60),
        cleanHeadline,
        trimOrNull(summary, 600),
        trimOrNull(byline, 100) || 'By Anonymous',
        photo
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

// Delete a single tip (admin only)
app.delete('/api/admin/tips/:id', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
  try {
    const result = await pool.query('DELETE FROM tips WHERE id = $1', [id]);
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    console.error('[delete]', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// Delete every tip (admin only)
app.delete('/api/admin/tips', async (req, res) => {
  if (!checkAdmin(req)) return res.status(401).json({ error: 'unauthorized' });
  try {
    const result = await pool.query('DELETE FROM tips');
    res.json({ ok: true, deleted: result.rowCount });
  } catch (e) {
    console.error('[delete-all]', e);
    res.status(500).json({ error: 'delete failed' });
  }
});

// --- Public live feed endpoint (no auth) -----------------------------------
// Used by the #live projector view so the host doesn't need to sign in.
// Returns the most recent tips so the frontend can detect new ones by id.
app.get('/api/live/tips', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, created_at, section, headline, summary, byline, photo_data FROM tips ORDER BY id DESC LIMIT 200'
    );
    res.json({ tips: rows });
  } catch (e) {
    console.error('[live select]', e);
    res.status(500).json({ error: 'select failed' });
  }
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

// --- Boot ------------------------------------------------------------------
initDb()
  .then(() => app.listen(PORT, () => console.log(`[boot] listening on ${PORT}`)))
  .catch(err => { console.error('[boot] failed', err); process.exit(1); });
