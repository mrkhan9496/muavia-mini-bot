/**
 * Persistent storage: Neon Postgres when DATABASE_URL is set,
 * otherwise local JSON file (data/bot_data.json).
 *
 * Tables:
 *   schedules (id, recipient, message, run_at, status, attempts, last_error, created_at)
 *   bot_settings (key, value)  -- chatbot state, autopost, times, channel jid, etc.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'bot_data.json');

let pool = null;
let useDb = false;
let mem = { schedules: [], bot_settings: {} };

function defaultSettings() {
    return {
        chatbot: 'off',          // on | off
        autopost: 'off',          // on | off
        post_times: '10:00,13:00,16:00,19:00,22:00',
        channel_jid: '',
        last_post: '',
        last_post_error: '',
        post_count: '0',
        antidelete: 'on',        // on | off — default ON (user demand)
        antiviewonce: 'on',      // on | off — default ON (user demand)
        alwaysonline: 'on',      // on | off — default ON (user demand)
    };
}

async function init() {
    if (process.env.DATABASE_URL) {
        try {
            const { Pool } = require('pg');
            pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                ssl: { rejectUnauthorized: false },
                max: 3,
            });
            await pool.query('SELECT 1');
            await pool.query(`CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                recipient TEXT NOT NULL,
                message TEXT NOT NULL,
                run_at TIMESTAMPTZ NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                attempts INT NOT NULL DEFAULT 0,
                last_error TEXT DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS bot_settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL DEFAULT ''
            )`);
            // seed defaults
            for (const [k, v] of Object.entries(defaultSettings())) {
                await pool.query(
                    'INSERT INTO bot_settings(key, value) VALUES($1,$2) ON CONFLICT(key) DO NOTHING',
                    [k, v]
                );
            }
            useDb = true;
            console.log('[db] Postgres connected');
            return;
        } catch (e) {
            console.error('[db] Postgres failed, using file:', e.message);
        }
    }
    // file fallback
    try {
        if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
        if (fs.existsSync(DATA_FILE)) {
            const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            mem.schedules = raw.schedules || [];
            mem.bot_settings = { ...defaultSettings(), ...(raw.bot_settings || {}) };
        } else {
            mem.bot_settings = defaultSettings();
            saveFile();
        }
        console.log('[db] file storage ready');
    } catch (e) {
        console.error('[db] file init failed:', e.message);
        mem.bot_settings = defaultSettings();
    }
}

function saveFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ schedules: mem.schedules, bot_settings: mem.bot_settings }, null, 1));
    } catch (e) { console.error('[db] save failed:', e.message); }
}

// ---------- schedules ----------
async function addSchedule(s) {
    if (useDb) {
        await pool.query(
            'INSERT INTO schedules(id, recipient, message, run_at, status) VALUES($1,$2,$3,$4,$5)',
            [s.id, s.recipient, s.message, s.run_at, 'pending']
        );
    } else {
        mem.schedules.push({ ...s, status: 'pending', attempts: 0, last_error: '' });
        saveFile();
    }
}

async function listSchedules(status) {
    if (useDb) {
        const q = status
            ? await pool.query('SELECT * FROM schedules WHERE status=$1 ORDER BY run_at', [status])
            : await pool.query('SELECT * FROM schedules ORDER BY run_at');
        return q.rows;
    }
    const all = mem.schedules.slice().sort((a, b) => new Date(a.run_at) - new Date(b.run_at));
    return status ? all.filter(s => s.status === status) : all;
}

async function getDueSchedules(nowIso) {
    if (useDb) {
        const q = await pool.query(
            "SELECT * FROM schedules WHERE status IN ('pending','failed') AND run_at <= $1 ORDER BY run_at LIMIT 20",
            [nowIso]
        );
        return q.rows;
    }
    return mem.schedules
        .filter(s => (s.status === 'pending' || s.status === 'failed') && new Date(s.run_at) <= new Date(nowIso))
        .slice(0, 20);
}

async function updateSchedule(id, patch) {
    if (useDb) {
        const sets = [], vals = [];
        let i = 1;
        for (const [k, v] of Object.entries(patch)) { sets.push(`${k}=$${i++}`); vals.push(v); }
        vals.push(id);
        await pool.query(`UPDATE schedules SET ${sets.join(',')} WHERE id=$${i}`, vals);
    } else {
        const s = mem.schedules.find(x => x.id === id);
        if (s) { Object.assign(s, patch); saveFile(); }
    }
}

async function cancelSchedule(id) {
    if (useDb) {
        const r = await pool.query("UPDATE schedules SET status='cancelled' WHERE id=$1 AND status IN ('pending','failed')", [id]);
        return r.rowCount > 0;
    }
    const s = mem.schedules.find(x => x.id === id && (x.status === 'pending' || x.status === 'failed'));
    if (s) { s.status = 'cancelled'; saveFile(); return true; }
    return false;
}

async function cancelAllSchedules() {
    if (useDb) {
        const r = await pool.query("UPDATE schedules SET status='cancelled' WHERE status IN ('pending','failed')");
        return r.rowCount;
    }
    let n = 0;
    for (const s of mem.schedules) {
        if (s.status === 'pending' || s.status === 'failed') { s.status = 'cancelled'; n++; }
    }
    saveFile();
    return n;
}

// ---------- settings ----------
async function getSetting(key) {
    let raw;
    if (useDb) {
        const q = await pool.query('SELECT value FROM bot_settings WHERE key=$1', [key]);
        raw = q.rows[0]?.value ?? defaultSettings()[key] ?? '';
    } else {
        raw = mem.bot_settings[key] ?? defaultSettings()[key] ?? '';
    }
    // JSON values (arrays/objects) ko wapas parse karo
    if (typeof raw === 'string' && (raw.startsWith('{') || raw.startsWith('['))) {
        try { return JSON.parse(raw); } catch (_) {}
    }
    return raw;
}

async function setSetting(key, value) {
    // Strings as-is; arrays/objects JSON mein (pehle String() bug tha)
    const str = typeof value === 'string' ? value : JSON.stringify(value);
    if (useDb) {
        await pool.query(
            'INSERT INTO bot_settings(key,value) VALUES($1,$2) ON CONFLICT(key) DO UPDATE SET value=$2',
            [key, str]
        );
    } else {
        mem.bot_settings[key] = str;
        saveFile();
    }
}

module.exports = { init, addSchedule, listSchedules, getDueSchedules, updateSchedule, cancelSchedule, cancelAllSchedules, getSetting, setSetting };
