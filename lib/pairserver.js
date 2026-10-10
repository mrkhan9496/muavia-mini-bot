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

let lastPairAt = 0;
const PAIR_COOLDOWN_MS = 30000;
let serverStarted = false;

function startPairServer(getSock) {
    if (serverStarted) return;
    serverStarted = true;

    const app = express();
    app.use(express.json({ limit: '10kb' }));

    app.get('/', (req, res) => {
        res.sendFile(path.join(__dirname, '..', 'public', 'pair.html'));
    });

    app.get('/health', (req, res) => res.json({ ok: true }));

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
            const sock = getSock();
            if (!sock) {
                return res.status(503).json({ error: 'Bot abhi start ho raha hai — 30 second baad try karein.' });
            }
            if (sock.authState && sock.authState.creds && sock.authState.creds.registered) {
                return res.status(409).json({ error: 'Bot pehle se paired hai! Dobara code ki zaroorat nahi.' });
            }
            lastPairAt = now;
            let code;
            try {
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
            res.status(500).json({ error: 'Pairing code nahi mil saka: ' + String(e.message).slice(0, 120) });
        }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`[pair] Pairing page live: http://localhost:${port}`));
}

module.exports = { startPairServer };
