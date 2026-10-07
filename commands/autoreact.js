/**
 * .autoreact on/off — har incoming message par automatic emoji react.
 *
 * Jab ON ho to koi bhi message aaye (text, image, video, audio, document —
 * kuchh bhi), bot us par random emoji se react karega.
 * Emojis wahi honge jo .statusreact se set hain (default: 17 wali list).
 *
 * Owner only. Setting: 'autoreact' on|off via lib/db.
 */
const db = require('../lib/db');

const DEFAULT_EMOJIS = ['🗿', '🥀', '♦️', '🎭', '🎁', '🥺', '❤️‍🔥', '😏', '😋', '😛', '🥰', '😉', '🤫', '🧐', '🤨', '🫣', '🤭'];

async function getEmojis() {
    const setting = await db.getSetting('status_emojis');
    const list = setting ? setting.split(' ').filter(Boolean) : DEFAULT_EMOJIS;
    return list.length ? list : DEFAULT_EMOJIS;
}

async function autoreactCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = (await db.getSetting('autoreact')) === 'on';
        const emojis = await getEmojis();
        return sock.sendMessage(from, {
            text: `⚡ *AUTO REACT*\n\n` +
                  `Status: ${on ? '✅ ON' : '❌ OFF'}\n` +
                  `Emojis: ${emojis.join(' ')}\n\n` +
                  `*Usage:*\n.autoreact on — har message par auto react\n` +
                  `.autoreact off — band karo\n\n` +
                  `Emojis badalne ke liye: .statusreact 🎭💙🗿`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('autoreact', arg);
        return sock.sendMessage(from, {
            text: arg === 'on'
                ? '⚡ *Auto React ON!*\nAb har incoming message par automatic emoji react hoga! 🎉'
                : '⚡ *Auto React OFF!*'
        }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .autoreact on | off' }, { quoted: msg });
}

// Har incoming message par react (status@broadcast ko chhor kar — wo autostatus dekhta hai)
async function handleAutoReact(sock, msg) {
    try {
        if ((await db.getSetting('autoreact')) !== 'on') return;
        if (!msg?.key) return;
        const emojis = await getEmojis();
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];
        const from = msg.key.remoteJid;
        await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
    } catch (e) {}
}

module.exports = { autoreactCmd, handleAutoReact };
