// Database-backed Baileys auth state (PostgreSQL) — mini bot ke liye.
// Production MR MUAVIA MD BOT se port kiya gaya.
//
// KYUN: Railway ka filesystem EPHEMERAL hai — har redeploy par auth_info/
// wipe ho jata hai, bot unpair ho jata hai. Session Postgres mein (free Neon
// DB) save karne se redeploy ke baad bhi paired rehta hai — dobara QR/code
// ki zaroorat nahi!
//
// Usage: DATABASE_URL env var set karo. Na ho to file-based auth (pehle jaisa).

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

let pool = null;

function getPool() {
    const url = process.env.DATABASE_URL;
    if (!url) return null;
    if (!pool) {
        const { Pool } = require('pg');
        pool = new Pool({
            connectionString: url,
            ssl: { rejectUnauthorized: false },
            max: 3,
        });
        pool.on('error', (err) => console.error('[DB] pool error:', err.message));
    }
    return pool;
}

async function ensureTable() {
    const p = getPool();
    if (!p) return false;
    await p.query(`
        CREATE TABLE IF NOT EXISTS wa_sessions (
            user_id   TEXT PRIMARY KEY,
            creds     TEXT NOT NULL,
            keys_data TEXT NOT NULL DEFAULT '{}',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    `);
    return true;
}

function serializeCreds(creds) {
    return JSON.stringify(creds, BufferJSON.replacer);
}
function serializeKeys(keysData) {
    return JSON.stringify(keysData, BufferJSON.replacer);
}
function parseCreds(text) {
    return JSON.parse(text, BufferJSON.reviver);
}
function parseKeys(text) {
    return JSON.parse(text || '{}', BufferJSON.reviver);
}

async function saveSessionRow(userId, creds, keysData) {
    const p = getPool();
    if (!p) return;
    try {
        await p.query(
            `INSERT INTO wa_sessions (user_id, creds, keys_data, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (user_id) DO UPDATE
             SET creds = EXCLUDED.creds, keys_data = EXCLUDED.keys_data, updated_at = now()`,
            [userId, serializeCreds(creds), serializeKeys(keysData)]
        );
    } catch (err) {
        console.error(`[DB] save session failed:`, err.message);
    }
}

// Baileys-compatible { state, saveCreds }. DATABASE_URL na ho to files.
async function getAuthState(userId, fileAuthPath) {
    const { useMultiFileAuthState } = require('@whiskeysockets/baileys');
    if (!process.env.DATABASE_URL) {
        console.log('[DB] DATABASE_URL nahi hai — file-based auth use ho raha hai.');
        return useMultiFileAuthState(fileAuthPath);
    }
    try {
        await ensureTable();
        const p = getPool();
        let creds = null;
        let keysData = {};
        try {
            const r = await p.query('SELECT creds, keys_data FROM wa_sessions WHERE user_id = $1', [userId]);
            if (r.rows.length) {
                creds = parseCreds(r.rows[0].creds);
                keysData = parseKeys(r.rows[0].keys_data);
                console.log(`[DB] WhatsApp session database se load ho gaya ✅`);
            }
        } catch (err) {
            console.error(`[DB] load session failed, fresh start:`, err.message);
        }
        if (!creds) creds = initAuthCreds();

        const saveCreds = () => saveSessionRow(userId, creds, keysData);

        const state = {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    for (const id of ids) {
                        let value = keysData[`${type}-${id}`];
                        if (type === 'app-state-sync-key' && value) {
                            value = proto.Message.AppStateSyncKeyData.fromObject(value);
                        }
                        data[id] = value;
                    }
                    return data;
                },
                set: async (data) => {
                    for (const category of Object.keys(data || {})) {
                        for (const id of Object.keys(data[category] || {})) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) keysData[key] = value;
                            else delete keysData[key];
                        }
                    }
                    await saveSessionRow(userId, creds, keysData);
                },
            },
        };
        return { state, saveCreds };
    } catch (err) {
        console.error('[DB] auth init failed, files par wapas:', err.message);
        return useMultiFileAuthState(fileAuthPath);
    }
}

function usesDatabase() {
    return !!process.env.DATABASE_URL;
}

module.exports = { getAuthState, usesDatabase };
