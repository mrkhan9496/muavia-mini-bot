/**
 * .autogreet — naye group members ko auto-welcome.
 *
 * .autogreet on            — is group mein ON karo (admin only)
 * .autogreet off           — OFF karo
 * .autogreet set <text>    — custom greeting set karo
 * .autogreet               — status dekho
 *
 * Naya member add hote hi greeting jati hai.
 */
const db = require('../lib/db');

const DEFAULT_GREET = 'Assalam-o-Alaikum! 🎉 Group mein khush aamdeed! Rules parhne ke liye .rules likhein.';

async function getConfig() {
    return (await db.getSetting('autogreet')) || {};
}
async function saveConfig(c) {
    await db.setSetting('autogreet', c);
}

async function autogreetCmd(sock, from, msg, args, isAdmin) {
    if (!from.endsWith('@g.us')) {
        return sock.sendMessage(from, { text: '❌ Ye command sirf groups mein.' }, { quoted: msg });
    }
    const sub = ((args[0] || '').toLowerCase());
    const cfg = await getConfig();

    if (sub === 'on' || sub === 'off') {
        if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
        cfg[from] = cfg[from] || {};
        cfg[from].on = sub === 'on';
        await saveConfig(cfg);
        return sock.sendMessage(from, {
            text: sub === 'on' ? '✅ Auto-greet ON ho gaya! 🎉' : '❌ Auto-greet OFF ho gaya.',
        }, { quoted: msg });
    }
    if (sub === 'set') {
        if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
        const text = (args || []).slice(1).join(' ').trim();
        if (!text) return sock.sendMessage(from, { text: '❌ Usage: .autogreet set <greeting text>' }, { quoted: msg });
        cfg[from] = cfg[from] || {};
        cfg[from].text = text.slice(0, 300);
        await saveConfig(cfg);
        return sock.sendMessage(from, { text: '✅ Greeting set ho gayi!' }, { quoted: msg });
    }
    const on = cfg[from]?.on;
    return sock.sendMessage(from, {
        text: `👋 *Auto-greet:* ${on ? 'ON ✅' : 'OFF ❌'}\n\nUsage:\n.autogreet on\n.autogreet off\n.autogreet set <text>`,
    }, { quoted: msg });
}

/** group.participants.update se call hota hai (index.js). */
async function handleMemberAdd(sock, groupJid, participants) {
    try {
        const cfg = await getConfig();
        const g = cfg[groupJid];
        if (!g || !g.on) return;
        const text = g.text || DEFAULT_GREET;
        const mentions = participants || [];
        await sock.sendMessage(groupJid, {
            text: `👋 ${text}`,
            mentions,
        });
    } catch (_) {}
}

module.exports = { autogreetCmd, handleMemberAdd };
