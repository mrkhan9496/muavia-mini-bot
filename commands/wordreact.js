/**
 * .wordreact on/off — khaas WORDS par khaas EMOJI react (bina dot ke).
 *
 * Jab ON ho to koi bhi incoming text message agar neeche wali list ke
 * kisi word se match kare (case-insensitive, poora message ya word),
 * to bot us par muqarrar emoji se react karega.
 *
 * Misal: koi "wow" likhe → bot 🤩 react karega. "love" → ❤️
 *
 * Owner only. Setting: 'wordreact' on|off via lib/db.
 */
const db = require('../lib/db');

// Word → emoji mapping (Naveed MD Mini style + apne)
const WORD_EMOJIS = {
    'wah': '😍', 'ohh': '😲', 'oho': '😄', 'wow': '🤩',
    'good': '👍', 'nice': '👌', 'hyeee': '😍', 'hyee': '😍',
    'baby': '🥰', 'so cute': '😻', 'cute': '🥰',
    'jani': '❤️', 'janu': '💖',
    'umaaa': '😘', 'umaah': '😘', 'kiss': '💋',
    'sad': '😭', 'hot': '🥵', 'so hot': '🔥',
    'gussa': '😒', 'happy': '😂', 'love': '❤️',
    'omg': '😱', 'uff': '😩', 'hayee': '🥺',
    'mashallah': '🤲', 'oye': '👀', 'oyee': '👀',
    'ok': '👌',
};

function getText(msg) {
    try {
        const m = msg.message || {};
        return (m.conversation || m.extendedTextMessage?.text || '').trim().toLowerCase();
    } catch (e) { return ''; }
}

async function wordreactCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = (await db.getSetting('wordreact')) === 'on';
        const words = Object.keys(WORD_EMOJIS).join(', ');
        return sock.sendMessage(from, {
            text: `💋 *WORD REACT*\n\n` +
                  `Status: ${on ? '✅ ON' : '❌ OFF'}\n\n` +
                  `*Kaam:* Koi ye words likhe (bina dot ke) → bot auto emoji react karega!\n\n` +
                  `*Words:* ${words}\n\n` +
                  `*Usage:*\n.wordreact on — on karo\n.wordreact off — band karo`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('wordreact', arg);
        return sock.sendMessage(from, {
            text: arg === 'on'
                ? '💋 *Word React ON!*\nAb "wow", "love", "cute" jaise words par auto emoji react hoga! 🎉'
                : '💋 *Word React OFF!*'
        }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .wordreact on | off' }, { quoted: msg });
}

// Har incoming text message par word match check
async function handleWordReact(sock, msg) {
    try {
        if ((await db.getSetting('wordreact')) !== 'on') return;
        if (!msg?.key || msg.key.fromMe) return;
        const text = getText(msg);
        if (!text) return;
        // Poora message match kare ya multi-word phrase ho
        const emoji = WORD_EMOJIS[text];
        if (!emoji) return;
        const from = msg.key.remoteJid;
        await sock.sendMessage(from, { react: { text: emoji, key: msg.key } });
    } catch (e) {}
}

module.exports = { wordreactCmd, handleWordReact, WORD_EMOJIS };
