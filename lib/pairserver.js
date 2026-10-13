/**
 * PAIRING SERVER — multi-session mini bot ke liye.
 *
 * Flow (user ki demand ke mutabiq):
 *   1. Banda apna number dalta hai
 *   2. Choice karta hai: QR Code ya Pairing Code
 *   3. Naya session banta hai, QR/code generate hota hai
 *   4. Pair ho jata hai — uska apna bot!
 *
 * Endpoints:
 *   GET  /                    → public/pair.html
 *   POST /api/session/new     → { sessionId } (naya session banao)
 *   GET  /api/qr?session=xxx  → { qr } ya { paired: true }
 *   POST /api/pair            → { number, session } → { code }
 *   GET  /api/sessions        → sab sessions ki list
 *   GET  /api/session-status?session=xxx → DB session info
 *   POST /api/reset           → session reset (DB se bhi delete)
 */
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');
const crypto = require('crypto');

let sessions = null;
let requestSocketRestart = null;
let serverStarted = false;

// Per-session cooldown (pairing-code hammering = ban trigger)
const pairCooldowns = new Map(); // sessionId → timestamp
const PAIR_COOLDOWN_MS = 30000;

function genSessionId() {
    return crypto.randomBytes(6).toString('hex');
}

async function waitForSocketReady(sock, getStateFn, timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (getStateFn) {
                const st = getStateFn();
                if (st === 'connecting' || st === 'open') return true;
            } else if (sock && sock.ws && sock.ws.readyState === 1) {
                return true;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    return false;
}

function applyPairingFix(sock) {
    if (!sock || sock._pairFixApplied) return;
    try {
        const { bytesToCrockford, derivePairingCodeKey, aesEncryptCTR, jidEncode } = require('@whiskeysockets/baileys');
        const { randomBytes } = require('crypto');
        const sockRef = sock;
        sockRef.requestPairingCode = async (phoneNumber, customPairingCode) => {
            const pairingCode = customPairingCode ?? bytesToCrockford(randomBytes(5));
            if (customPairingCode && customPairingCode?.length !== 8) {
                throw new Error('Custom pairing code must be exactly 8 chars');
            }
            const { registrationId } = sockRef.authState.creds;
            const code = await sockRef.query({
                tag: 'iq',
                attrs: { xmlns: 'urn:xmpp:whatsapp:push', to: '@s.whatsapp.net', type: 'set' },
                content: [{
                    tag: 'code',
                    attrs: {},
                    content: Buffer.from(pairingCode, 'utf8')
                }]
            });
            return pairingCode;
        };
        sock._pairFixApplied = true;
    } catch (e) {
        console.error('[pair] Fix apply failed:', e.message);
    }
}

function startPairServer(sessionsMgr, requestRestartFn) {
    sessions = sessionsMgr;
    requestSocketRestart = requestRestartFn;
    if (serverStarted) return;
    serverStarted = true;

    const app = express();
    app.use(express.json({ limit: '10kb' }));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'pair.html'));
    });

    app.get('/health', (req, res) => res.json({ ok: true }));

    // Naya session banao — pairing shuru karne ke liye
    // Agar pehle se koi unpaired session hai to wahi reuse karo (duplicate nahi!)
    app.post('/api/session/new', async (req, res) => {
        try {
            // Pehle dekho koi unpaired session hai?
            for (const s of sessions.list()) {
                const full = sessions.get(s.id);
                if (full && !full.paired && s.id !== 'default') {
                    console.log(`[pair] Reusing unpaired session: ${s.id}`);
                    return res.json({ sessionId: s.id, reused: true });
                }
            }
            const sessionId = genSessionId();
            sessions.create(sessionId);
            // index.js ka startSession call karo (global se)
            if (typeof global.startMiniSession === 'function') {
                global.startMiniSession(sessionId).catch(e =>
                    console.error(`[pair] Session ${sessionId} start failed:`, e.message));
            }
            console.log(`[pair] New session created: ${sessionId}`);
            res.json({ sessionId });
        } catch (e) {
            res.status(500).json({ error: 'Session nahi ban saka.' });
        }
    });

    // Sab sessions ki list
    app.get('/api/sessions', (req, res) => {
        res.json({ sessions: sessions.list() });
    });

    // QR code — specific session ke liye (koi pre-made QR nahi!)
    app.get('/api/qr', async (req, res) => {
        try {
            const sessionId = req.query.session;
            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID chahiye. Pehle number dal kar QR select karo.' });
            }
            const session = sessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session nahi mila.' });
            }
            if (session.paired) {
                return res.json({ paired: true, phone: session.phone });
            }
            if (!session.qr) {
                return res.json({ qr: null, message: 'QR ban raha hai — 10 second baad refresh karo.' });
            }
            const dataUrl = await QRCode.toDataURL(session.qr, { width: 280, margin: 1 });
            res.json({ qr: dataUrl, sessionId });
        } catch (e) {
            res.status(500).json({ error: 'QR nahi ban saka.' });
        }
    });

    // Pairing code — specific session ke liye
    app.post('/api/pair', async (req, res) => {
        try {
            const number = String((req.body && req.body.number) || '').replace(/[^0-9]/g, '');
            const sessionId = req.body.session;
            if (number.length < 10 || number.length > 15) {
                return res.status(400).json({ error: 'Ghalat number. Country code ke saath likhein.' });
            }
            if (!sessionId) {
                return res.status(400).json({ error: 'Session ID chahiye.' });
            }
            const session = sessions.get(sessionId);
            if (!session) {
                return res.status(404).json({ error: 'Session nahi mila. Dobara try karo.' });
            }
            if (session.paired) {
                return res.status(409).json({ error: 'Ye session pehle se paired hai!' });
            }
            const now = Date.now();
            const lastAt = pairCooldowns.get(sessionId) || 0;
            if (now - lastAt < PAIR_COOLDOWN_MS) {
                const wait = Math.ceil((PAIR_COOLDOWN_MS - (now - lastAt)) / 1000);
                return res.status(429).json({ error: `Thoda wait karein (${wait}s).` });
            }
            const sock = session.sock;
            if (!sock) {
                return res.status(503).json({ error: 'Bot start ho raha hai — 30 second baad try karein.' });
            }
            let ready = await waitForSocketReady(sock, () => session.connState, 8000);
            if (!ready && typeof requestSocketRestart === 'function') {
                console.log(`[pair] Socket not ready for ${sessionId} — restarting.`);
                try { await requestSocketRestart(sessionId); } catch {}
                const s2 = sessions.get(sessionId);
                ready = await waitForSocketReady(s2?.sock, () => s2?.connState, 15000);
            }
            if (!ready) {
                return res.status(503).json({ error: 'WhatsApp se connection nahi — 30 second baad try karein.' });
            }
            pairCooldowns.set(sessionId, now);
            let code;
            try {
                applyPairingFix(sock);
                code = await sock.requestPairingCode(number);
            } catch (e) {
                pairCooldowns.delete(sessionId);
                throw e;
            }
            if (!code) throw new Error('WhatsApp ne code nahi diya.');
            const pretty = code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code;
            console.log(`[pair] Code for session ${sessionId}: ${number.slice(0, 4)}****`);
            res.json({ code: pretty, sessionId });
        } catch (e) {
            console.error('[pair] error:', e.message);
            let errMsg = String(e.message || '').slice(0, 120);
            if (/bad-request|400/i.test(errMsg)) {
                errMsg = 'WhatsApp ne mana kar diya. Number ban/block ho sakta hai.';
            } else if (/connection closed|not open|websocket/i.test(errMsg)) {
                errMsg = 'Connection toot gayi — dobara try karein.';
            }
            res.status(500).json({ error: errMsg });
        }
    });

    // Session status (diagnostic)
    app.get('/api/session-status', async (req, res) => {
        try {
            const sessionId = req.query.session || 'default';
            const url = process.env.DATABASE_URL;
            if (!url) return res.json({ db: false, reason: 'DATABASE_URL not set' });
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
            const r = await pool.query(
                'SELECT user_id, updated_at, LENGTH(creds) as cl, LENGTH(keys_data) as kl FROM wa_sessions WHERE user_id = $1',
                [`mini-bot-${sessionId}`]
            );
            await pool.end();
            if (!r.rows.length) return res.json({ db: true, hasSession: false, sessionId });
            const row = r.rows[0];
            res.json({ db: true, hasSession: true, credsLength: parseInt(row.cl), keysLength: parseInt(row.kl), lastSaved: row.updated_at, sessionId });
        } catch (e) {
            res.status(500).json({ db: false, error: e.message });
        }
    });

    // Session reset
    app.post('/api/reset', async (req, res) => {
        try {
            const sessionId = (req.body && req.body.session) || 'default';
            sessions.remove(sessionId);
            try {
                const url = process.env.DATABASE_URL;
                if (url) {
                    const { Pool } = require('pg');
                    const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
                    await pool.query('DELETE FROM wa_sessions WHERE user_id = $1', [`mini-bot-${sessionId}`]);
                    await pool.end();
                }
            } catch {}
            res.json({ ok: true, message: 'Session reset ho gaya.' });
        } catch (e) {
            res.status(500).json({ error: 'Reset nahi ho saka.' });
        }
    });

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`[pair] Server on :${PORT} (multi-session)`));
}

module.exports = { startPairServer };
