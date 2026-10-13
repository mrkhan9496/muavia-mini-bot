/**
 * Multi-session manager — ek bot, multiple WhatsApp connections.
 *
 * Har session ka apna:
 *   - Baileys socket (sock)
 *   - QR code (latestQR)
 *   - Connection state
 *   - DB auth (user_id = `mini-bot-<sessionId>`)
 *
 * Usage:
 *   const sessions = require('./lib/sessions');
 *   sessions.create('abc123');  // naya session
 *   sessions.get('abc123');      // { sock, qr, paired, ... }
 *   sessions.list();             // sab sessions
 *   sessions.remove('abc123');   // session hatao
 */

const sessions = new Map();

function create(sessionId) {
    if (sessions.has(sessionId)) return sessions.get(sessionId);
    const session = {
        id: sessionId,
        sock: null,
        qr: null,
        paired: false,
        phone: null,
        connState: 'close',
        consecutiveFailures: 0,
        parked: false,
        createdAt: Date.now(),
    };
    sessions.set(sessionId, session);
    console.log(`[sessions] Created session: ${sessionId}`);
    return session;
}

function get(sessionId) {
    return sessions.get(sessionId) || null;
}

function list() {
    return Array.from(sessions.values()).map(s => ({
        id: s.id,
        paired: s.paired,
        phone: s.phone,
        connState: s.connState,
        createdAt: s.createdAt,
    }));
}

function remove(sessionId) {
    const s = sessions.get(sessionId);
    if (s) {
        try {
            if (s.sock) s.sock.end();
        } catch {}
        sessions.delete(sessionId);
        console.log(`[sessions] Removed session: ${sessionId}`);
    }
}

function setSock(sessionId, sock) {
    const s = sessions.get(sessionId);
    if (s) s.sock = sock;
}

function setQR(sessionId, qr) {
    const s = sessions.get(sessionId);
    if (s) s.qr = qr;
}

function setPaired(sessionId, paired, phone = null) {
    const s = sessions.get(sessionId);
    if (s) {
        s.paired = paired;
        if (phone) s.phone = phone;
        if (paired) s.qr = null; // paired hone par QR clear
    }
}

function setConnState(sessionId, state) {
    const s = sessions.get(sessionId);
    if (s) s.connState = state;
}

// DB mein maujood sessions load karo (startup par)
async function loadFromDB() {
    try {
        const url = process.env.DATABASE_URL;
        if (!url) {
            console.log('[sessions] DATABASE_URL nahi — sirf default session.');
            return [];
        }
        const { Pool } = require('pg');
        const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
        const r = await pool.query(
            "SELECT user_id FROM wa_sessions WHERE user_id LIKE 'mini-bot-%'"
        );
        await pool.end();
        const ids = r.rows.map(row => row.user_id.replace('mini-bot-', ''));
        console.log(`[sessions] DB se ${ids.length} sessions mile:`, ids.join(', '));
        return ids;
    } catch (e) {
        console.error('[sessions] DB load failed:', e.message);
        return [];
    }
}

module.exports = { create, get, list, remove, setSock, setQR, setPaired, setConnState, loadFromDB };
