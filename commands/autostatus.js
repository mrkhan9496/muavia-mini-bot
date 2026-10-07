/**
 * .autostatus on | off — ONE command for auto status view + react.
 *
 * When ON, every incoming status update is:
 *   1. auto-viewed (marked as seen via readMessages)
 *   2. auto-reacted with an emoji (custom list from .statusreact, or default)
 *
 * WIRING (index.js, by parent): onMessage currently ignores
 * 'status@broadcast'. Before that early return, call:
 *   const as = require('./commands/autostatus');
 *   if (from === 'status@broadcast') { await as.handleStatusUpdate(sock, m); return; }
 *
 * Settings stored via lib/db (bot_settings): 'autostatus' on|off,
 * 'status_emojis' space-separated custom emoji list.
 */
const db = require('../lib/db');

const DEFAULT_EMOJIS = ['🗿', '🥀', '♦️', '🎭', '🎁', '🥺', '❤️‍🔥', '😏', '😋', '😛', '🥰', '😉', '🤫', '🧐', '🤨', '🫣', '🤭'];

async function autostatusCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = (await db.getSetting('autostatus')) === 'on';
        const emojis = (await db.getSetting('status_emojis')) || DEFAULT_EMOJIS.join(' ');
        return sock.sendMessage(from, {
            text: `👁️ *AUTO STATUS*\n\n` +
                  `Status: ${on ? '✅ ON' : '❌ OFF'}\n` +
                  `React emojis: ${emojis}\n\n` +
                  `*Usage:*\n.autostatus on — view + react on sab statuses\n` +
                  `.autostatus off — band karo\n\n` +
                  `Emojis badalne ke liye: .statusreact 🎭💙🗿`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('autostatus', arg);
        return sock.sendMessage(from, {
            text: arg === 'on'
                ? '✅ *Auto Status ON!*\nAb har status auto-view + auto-react hoga 👁️❤️'
                : '❌ *Auto Status OFF!*'
        }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .autostatus on | off' }, { quoted: msg });
}

async function handleStatusUpdate(sock, m) {
    try {
        if ((await db.getSetting('autostatus')) !== 'on') return;

        const emojiSetting = await db.getSetting('status_emojis');
        const emojis = emojiSetting ? emojiSetting.split(' ').filter(Boolean) : DEFAULT_EMOJIS;
        const emoji = emojis[Math.floor(Math.random() * emojis.length)];

        for (const msg of (m.messages || [])) {
            try {
                if (!msg.key || (msg.key.remoteJid !== 'status@broadcast' && !msg.broadcast)) continue;
                const participant = msg.key.participant || msg.participant;
                if (!participant) continue;

                // 1. auto-view (mark as seen)
                try { await sock.readMessages([msg.key]); } catch (e) {}

                // 2. auto-react with emoji
                try {
                    await sock.relayMessage('status@broadcast', {
                        reactionMessage: {
                            key: {
                                remoteJid: 'status@broadcast',
                                id: msg.key.id,
                                participant: participant,
                                fromMe: false,
                            },
                            text: emoji,
                        },
                    }, { messageId: msg.key.id, statusJidList: [participant] });
                } catch (e) {
                    // react failed (e.g. unsupported) — view already done
                }
            } catch (e) {}
        }
    } catch (e) {}
}

module.exports = { autostatusCmd, handleStatusUpdate };
