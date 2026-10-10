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
            res.status(500).json({ error: 'Pairing code nahi mil saka: ' + String(e.message).slice(0, 120) });
        }
    });

    const port = process.env.PORT || 3000;
    app.listen(port, () => console.log(`[pair] Pairing page live: http://localhost:${port}`));
}

module.exports = { startPairServer };
