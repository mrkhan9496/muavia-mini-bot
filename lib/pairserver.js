/**
 * PAIRING CODE SERVER — mini bot ke liye web pairing page.
 *
 * GET  /          → public/pair.html (pairing page)
 * POST /api/pair  → { number } → pairing code (XXXX-XXXX)
 *
 * - Sirf tab code deta hai jab bot abhi paired NA ho.
 * - 30s cooldown (pairing-code hammering = ban trigger, is liye limit).
 * - Baileys ka stock requestPairingCode use hota hai.
 */
const express = require('express');
const path = require('path');
const QRCode = require('qrcode');

let lastPairAt = 0;
const PAIR_COOLDOWN_MS = 30000;
let serverStarted = false;
let latestQR = null; // Baileys se aya fresh QR string

/** index.js ke connection.update se call hota hai jab naya QR bane. */
function setLatestQR(qr) { latestQR = qr; }
/** Pair ho jaye to QR clear karo. */
function clearQR() { latestQR = null; }

/** Session reset: corrupt auth state saaf karo taake fresh pairing ho sake. */
function resetSessionState() {
    latestQR = null;
    lastPairAt = 0;
    console.log('[pair] Session state reset — fresh pairing ke liye tayyar.');
}

/**
 * Socket ka WebSocket OPEN hone ka wait karo (max 10s).
 * "Connection Closed" error se bachne ke liye — requestPairingCode
 * sirf tab kaam karta hai jab ws.readyState === 1 (OPEN) ho.
 */
async function waitForSocketReady(sock, timeoutMs = 10000) {
    // Baileys v7 mein sock.ws expose nahi hota — is liye getConnState() se
    // tracked connection state use karo. Pairing code ke liye 'connecting'
    // ya 'open' dono theek hain (QR flow mein socket connecting rehta hai).
    const getState = typeof getConnState === 'function' ? getConnState : null;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            if (getState) {
                const st = getState();
                if (st === 'connecting' || st === 'open') return true;
            } else if (sock && sock.ws && sock.ws.readyState === 1) {
                return true; // purana Baileys fallback
            }
        } catch {}
        await new Promise(r => setTimeout(r, 500));
    }
    try {
        if (getState) {
            const st = getState();
            return st === 'connecting' || st === 'open';
        }
        return sock && sock.ws && sock.ws.readyState === 1;
    } catch { return false; }
}

/**
 * FIX for Baileys #2737: stock requestPairingCode() returns a code
 * WITHOUT waiting for the server. If the server rejects (400),
 * the user gets a bogus code → "Couldn't link device".
 * This override uses query() (waits for response) and only
 * returns the code after the server accepts it.
 * (Production MR MUAVIA MD BOT ka proven pattern.)
 */
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
            const creds = sockRef.authState.creds;
            creds.pairingCode = pairingCode;
            creds.me = { id: jidEncode(phoneNumber, 's.whatsapp.net'), name: '~' };
            sockRef.ev.emit('creds.update', creds);
            const salt = randomBytes(32);
            const iv = randomBytes(16);
            const key = await derivePairingCodeKey(pairingCode, salt);
            const ciphered = aesEncryptCTR(creds.pairingEphemeralKeyPair.public, key, iv);
            const wrappedKey = Buffer.concat([salt, iv, ciphered]);
            const browser = sockRef.browser || ['SchedulerBot', 'Chrome', '1.0'];
            // query() WAITS for the server reply — throws on 400/error.
            // Stock sendNode() is fire-and-forget (the bug).
            await sockRef.query({
                tag: 'iq',
                attrs: {
                    to: '@s.whatsapp.net',
                    type: 'set',
                    id: 'pair-' + Date.now(),
                    xmlns: 'md'
                },
                content: [{
                    tag: 'link_code_companion_reg',
                    attrs: {
                        jid: creds.me.id,
                        stage: 'companion_hello',
                        should_show_push_notification: 'true'
                    },
                    content: [
                        { tag: 'link_code_pairing_wrapped_companion_ephemeral_pub', attrs: {}, content: wrappedKey },
                        { tag: 'companion_server_auth_key_pub', attrs: {}, content: creds.noiseKey.public },
                        { tag: 'companion_platform_id', attrs: {}, content: '1' },
                        { tag: 'companion_platform_display', attrs: {}, content: `${browser[1]} (${browser[0]})` },
                        { tag: 'link_code_pairing_nonce', attrs: {}, content: '0' }
                    ]
                }]
            });
            // Server accepted — code is real.
            return pairingCode;
        };
        sock._pairFixApplied = true;
        console.log('[pair] Server-confirmed pairing fix applied.');
    } catch (e) {
        console.error('[pair] Fix not applied:', e.message);
    }
}

let getConnState = null;
function startPairServer(getSock, requestRestart, getConnStateFn) {
    if (typeof getConnStateFn === 'function') getConnState = getConnStateFn;
    if (serverStarted) return;
    serverStarted = true;

    const app = express();
    app.use(express.json({ limit: '10kb' }));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'pair.html'));
    });

    app.get('/health', (req, res) => res.json({ ok: true }));

    // Session status — DB mein session hai ya nahi, kab save hua (diagnostic)
    app.get('/api/session-status', async (req, res) => {
        try {
            const url = process.env.DATABASE_URL;
            if (!url) return res.json({ db: false, reason: 'DATABASE_URL not set — file auth' });
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
            const r = await pool.query(
                'SELECT user_id, updated_at, LENGTH(creds) as creds_len, LENGTH(keys_data) as keys_len FROM wa_sessions WHERE user_id = $1',
                ['mini-bot']
            );
            await pool.end();
            if (!r.rows.length) return res.json({ db: true, hasSession: false });
            const row = r.rows[0];
            res.json({
                db: true,
                hasSession: true,
                credsLength: parseInt(row.creds_len),
                keysLength: parseInt(row.keys_len),
                lastSaved: row.updated_at,
            });
        } catch (e) {
            res.status(500).json({ db: false, error: e.message });
        }
    });

    // Session reset: corrupt state saaf karo, fresh pairing ke liye
    app.post('/api/reset', (req, res) => {
        try {
            resetSessionState();
            // auth_info files bhi saaf karo (agla restart fresh hoga)
            const fs = require('fs');
            const authDir = path.join(__dirname, '..', 'auth_info');
            if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                console.log('[pair] auth_info deleted.');
            }
            res.json({ ok: true, message: 'Session reset ho gaya. Bot restart hoga — 1 minute baad QR scan karo.' });
            // 2 second baad process restart taake fresh socket bane
            setTimeout(() => process.exit(0), 2000);
        } catch (e) {
            res.status(500).json({ error: 'Reset nahi ho saka: ' + e.message });
        }
    });

    // QR code (image) — pairing page par scan ke liye. Har 20s refresh karo (QR expire hota hai).
    app.get('/api/qr', async (req, res) => {
        try {
            let sock = getSock();
            if (sock && sock.authState && sock.authState.creds && sock.authState.creds.registered) {
                return res.json({ paired: true });
            }
            // Agar QR nahi ban raha aur socket dead hai to restart karo
            if (!latestQR && typeof requestRestart === 'function') {
                const ready = await waitForSocketReady(sock, 3000);
                if (!ready) {
                    console.log('[qr] No QR and socket not ready — requesting restart.');
                    try { await requestRestart(); } catch {}
                    // Restart ke baad QR aane mein waqt lagta hai
                    return res.json({ qr: null, message: 'Bot restart ho raha hai — 20 second baad refresh karo.' });
                }
            }
            if (!latestQR) {
                return res.json({ qr: null, message: 'QR ban raha hai — 10 second baad refresh karo.' });
            }
            const dataUrl = await QRCode.toDataURL(latestQR, { width: 280, margin: 1 });
            res.json({ qr: dataUrl });
        } catch (e) {
            res.status(500).json({ error: 'QR nahi ban saka.' });
        }
    });

    app.post('/api/pair', async (req, res) => {
        try {
            const number = String((req.body && req.body.number) || '').replace(/[^0-9]/g, '');
            if (number.length < 10 || number.length > 15) {
                return res.status(400).json({ error: 'Ghalat number. Country code ke saath likhein (masalan 923001234567).' });
            }
            const now = Date.now();
            if (now - lastPairAt < PAIR_COOLDOWN_MS) {
                const wait = Math.ceil((PAIR_COOLDOWN_MS - (now - lastPairAt)) / 1000);
                return res.status(429).json({ error: `Thoda wait karein (${wait}s), phir try karein.` });
            }
            let sock = getSock();
            if (!sock) {
                return res.status(503).json({ error: 'Bot abhi start ho raha hai — 30 second baad try karein.' });
            }
            if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
                return res.status(409).json({ error: 'Bot pehle se paired hai! Dobara code ki zaroorat nahi.' });
            }
            // WebSocket OPEN hone ka wait karo (Connection Closed se bachne ke liye)
            let ready = await waitForSocketReady(sock, 8000);
            if (!ready && typeof requestRestart === 'function') {
                // Session parked/dead hai — unpark karke fresh socket start karo
                console.log('[pair] Socket not ready — requesting restart.');
                try { await requestRestart(); } catch (e) { console.error('[pair] restart failed:', e.message); }
                sock = getSock();
                ready = await waitForSocketReady(sock, 15000);
            }
            if (!ready) {
                return res.status(503).json({ error: 'WhatsApp se connection nahi jud saki — 30 second baad dobara try karein.' });
            }
            lastPairAt = now;
            let code;
            try {
                applyPairingFix(sock); // server-confirmed code (Baileys #2737 fix)
                code = await sock.requestPairingCode(number);
            } catch (e) {
                lastPairAt = 0; // fail par cooldown reset taake retry ho sake
                throw e;
            }
            if (!code) throw new Error('WhatsApp ne code nahi diya.');
            const pretty = code.length === 8 ? code.slice(0, 4) + '-' + code.slice(4) : code;
            console.log(`[pair] Code generated for ${number.slice(0, 4)}****`);
            res.json({ code: pretty });
        } catch (e) {
            console.error('[pair] error:', e.message);
            let errMsg = String(e.message || '').slice(0, 120);
            // Server ne mana kiya = number ban/block ya ghalat
            if (/bad-request|400/i.test(errMsg)) {
                errMsg = 'WhatsApp ne is number ko mana kar diya. Ye number ban ya block ho sakta hai — koi DOOSRA number try karein.';
            } else if (/connection closed|not open|websocket/i.test(errMsg)) {
                errMsg = 'WhatsApp se connection toot gayi — 30 second ruko aur dobara try karo.';
            }
            res.status(500).json({ error: 'Pairing code nahi mil saka: ' + errMsg });
        }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`[pair] Pairing page live: http://localhost:${port}`));
}

module.exports = { startPairServer, setLatestQR, clearQR };
