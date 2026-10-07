/**
 * .statusreact — choose which emojis the bot reacts with on statuses.
 *
 * Usage:
 *   .statusreact 🎭💙🗿👀   — set custom emoji list
 *   .statusreact off        — back to default emojis
 *   .statusreact            — show current list
 *
 * Works together with .autostatus (auto view + react).
 * Owner only. Stored via lib/db (bot_settings: 'status_emojis').
 */
const db = require('../lib/db');

const DEFAULT_EMOJIS = ['🗿', '🥀', '♦️', '🎭', '🎁', '🥺', '❤️‍🔥', '😏', '😋', '😛', '🥰', '😉', '🤫', '🧐', '🤨', '🫣', '🤭'];

async function statusreactCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });

    const input = (args || []).join(' ').trim();

    if (!input) {
        const current = (await db.getSetting('status_emojis')) || DEFAULT_EMOJIS.join(' ');
        return sock.sendMessage(from, {
            text: `🎭 *STATUS REACT EMOJIS*\n\nCurrent: ${current}\n\n` +
                  `Set karne ke liye:\n.statusreact 🎭💙🗿👀\n\n` +
                  `Default wapas:\n.statusreact off`
        }, { quoted: msg });
    }

    if (input.toLowerCase() === 'off') {
        await db.setSetting('status_emojis', '');
        return sock.sendMessage(from, { text: '✅ Status react emojis default par wapas!' }, { quoted: msg });
    }

    const emojis = [...input.matchAll(/\p{Extended_Pictographic}/gu)].map(m => m[0]);
    if (!emojis.length) {
        return sock.sendMessage(from,
            { text: '❌ Koi emoji nahi mila!\nExample: .statusreact 🎭💙🗿' },
            { quoted: msg });
    }

    await db.setSetting('status_emojis', emojis.join(' '));
    return sock.sendMessage(from, {
        text: `✅ *Status react emojis set!*\n\n${emojis.join(' ')}\n\nAb status par yehi emojis react honge! 🎉`
    }, { quoted: msg });
}

module.exports = { statusreactCmd };
