/**
 * GROUP MODERATION — group admins ke liye.
 * Note: link/antispam delete ke liye BOT ko group admin hona zaroori hai.
 *
 * .antilink on/off        — links wale messages delete karo (Warning 1/2, 2/2, 3rd = Kick)
 * .antispam on/off        — tez spam (4+ msgs / 15s) delete karo
 * .warn @user [wajah]     — warning do (3 warns = note)
 * .unwarn @user          — warnings clear karo
 * .mute @user / .unmute  — user ke messages delete karo / wapas
 * .rules [text]           — group rules set/dekho
 * .gcstatusall / .gcall   — (owner, inbox se) text/image sab groups mein bhejo
 */
const db = require('../lib/db');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

const LINK_RE = /(https?:\/\/|www\.|t\.me\/|chat\.whatsapp\.com\/)/i;
const spamTrack = new Map(); // chatJid -> userJid -> [timestamps]

async function getMod() { return (await db.getSetting('moderation')) || {}; }
async function saveMod(m) { await db.setSetting('moderation', m); }

function targetJid(msg, args) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.participant;
    if (quoted) return quoted;
    const mentioned = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid;
    if (mentioned && mentioned[0]) return mentioned[0];
    const num = String(args[0] || '').replace(/[^0-9]/g, '');
    if (num.length >= 10) return num + '@s.whatsapp.net';
    return null;
}

function needGroup(from) { return from.endsWith('@g.us'); }

async function toggleCmd(sock, from, msg, args, isAdmin, key, label) {
    if (!needGroup(from)) return sock.sendMessage(from, { text: '❌ Sirf groups mein.' }, { quoted: msg });
    const sub = (args[0] || '').toLowerCase();
    if (!['on', 'off'].includes(sub)) {
        const m = await getMod();
        const on = m[from]?.[key];
        return sock.sendMessage(from, { text: `${label}: ${on ? 'ON ✅' : 'OFF ❌'}\nUsage: .${key} on / .${key} off` }, { quoted: msg });
    }
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const m = await getMod();
    m[from] = m[from] || {};
    m[from][key] = sub === 'on';
    await saveMod(m);
    await sock.sendMessage(from, { text: `${label} ${sub === 'on' ? 'ON ✅' : 'OFF ❌'}` }, { quoted: msg });
}

async function antilinkCmd(s, f, m, a, admin) { return toggleCmd(s, f, m, a, admin, 'antilink', '🔗 Anti-link'); }
async function antispamCmd(s, f, m, a, admin) { return toggleCmd(s, f, m, a, admin, 'antispam', '🚫 Anti-spam'); }

async function warnCmd(sock, from, msg, args, isAdmin) {
    if (!needGroup(from)) return sock.sendMessage(from, { text: '❌ Sirf groups mein.' }, { quoted: msg });
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const target = targetJid(msg, args);
    if (!target) return sock.sendMessage(from, { text: '❌ Usage: .warn @user [wajah] (ya reply karke)' }, { quoted: msg });
    const reason = (args || []).slice(1).join(' ').trim().slice(0, 200) || 'Rules ki khilaf-warzi';
    const m = await getMod();
    m[from] = m[from] || {}; m[from].warns = m[from].warns || {};
    m[from].warns[target] = (m[from].warns[target] || 0) + 1;
    await saveMod(m);
    const count = m[from].warns[target];
    await sock.sendMessage(from, {
        text: `⚠️ *Warning ${count}/3*\n👤 @${target.split('@')[0]}\n📝 ${reason}${count >= 3 ? '\n\n🚨 3 warnings! Admin action lein.' : ''}`,
        mentions: [target],
    }, { quoted: msg });
}

async function unwarnCmd(sock, from, msg, args, isAdmin) {
    if (!needGroup(from)) return sock.sendMessage(from, { text: '❌ Sirf groups mein.' }, { quoted: msg });
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const target = targetJid(msg, args);
    if (!target) return sock.sendMessage(from, { text: '❌ Usage: .unwarn @user' }, { quoted: msg });
    const m = await getMod();
    if (m[from]?.warns) delete m[from].warns[target];
    await saveMod(m);
    await sock.sendMessage(from, { text: `✅ Warnings clear: @${target.split('@')[0]}`, mentions: [target] }, { quoted: msg });
}

async function muteCmd(sock, from, msg, args, isAdmin, unmute = false) {
    if (!needGroup(from)) return sock.sendMessage(from, { text: '❌ Sirf groups mein.' }, { quoted: msg });
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const target = targetJid(msg, args);
    if (!target) return sock.sendMessage(from, { text: `❌ Usage: .${unmute ? 'unmute' : 'mute'} @user` }, { quoted: msg });
    const m = await getMod();
    m[from] = m[from] || {}; m[from].muted = m[from].muted || {};
    if (unmute) delete m[from].muted[target]; else m[from].muted[target] = true;
    await saveMod(m);
    await sock.sendMessage(from, {
        text: unmute ? `🔊 Unmuted: @${target.split('@')[0]}` : `🔇 Muted: @${target.split('@')[0]} (uske messages delete honge)`,
        mentions: [target],
    }, { quoted: msg });
}

async function rulesCmd(sock, from, msg, args, isAdmin) {
    const m = await getMod();
    const text = (args || []).join(' ').trim();
    if (text) {
        if (!needGroup(from)) return sock.sendMessage(from, { text: '❌ Sirf groups mein.' }, { quoted: msg });
        if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
        m[from] = m[from] || {};
        m[from].rules = text.slice(0, 800);
        await saveMod(m);
        return sock.sendMessage(from, { text: '✅ Rules set ho gaye!' }, { quoted: msg });
    }
    const rules = m[from]?.rules || '📜 *Group Rules:*\n1. Ek dusre ki izzat karein\n2. Spam/links mana hain\n3. Admins ki baat manein';
    await sock.sendMessage(from, { text: rules }, { quoted: msg });
}

/**
 * Har incoming group message par call hota hai (index.js onMessage se).
 * Agar message delete kiya to true return karta hai.
 */
async function handleModeration(sock, msg, from) {
    try {
        if (!from.endsWith('@g.us')) return false;
        const m = await getMod();
        const g = m[from];
        if (!g) return false;
        const sender = msg.key.participant || from;
        const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';

        // Muted user → delete
        if (g.muted?.[sender]) {
            await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
            return true;
        }
        // Anti-link → delete + warn counter (Warning 1/2, 2/2, 3rd = Kick)
        if (g.antilink && text && LINK_RE.test(text)) {
            await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
            m[from].warns = m[from].warns || {};
            const count = (m[from].warns[sender] || 0) + 1;
            const tag = sender.split('@')[0];
            if (count >= 3) {
                delete m[from].warns[sender];
                await saveMod(m);
                await sock.groupParticipantsUpdate(from, [sender], 'remove').catch(() => {});
                await sock.sendMessage(from, {
                    text: `🚫 *LINK NOT ALLOWED* ❌\n\n⚠️ @${tag} — 3rd dafa link bheja!\n💥 *KICKED* — group se nikal diya gaya.\n\n> *Power by MR Muavia Mini bot*`,
                    mentions: [sender],
                }).catch(() => {});
            } else {
                m[from].warns[sender] = count;
                await saveMod(m);
                const next = count === 1 ? 'Warning 2/2, 3rd = Kick' : '3rd = Kick';
                await sock.sendMessage(from, {
                    text: `🚫 *LINK NOT ALLOWED* ❌\n\n⚠️ @${tag} Links Are Not Allowed Here! 🚷\n\n🔰 Warning ${count}/2 ⚠️\n➡️ Next: ${next} 💥\n\n> *Power by MR Muavia Mini bot*`,
                    mentions: [sender],
                }).catch(() => {});
            }
            return true;
        }
        // Anti-spam → 4+ messages in 15s
        if (g.antispam && text) {
            const key = from + '|' + sender;
            const now = Date.now();
            const arr = (spamTrack.get(key) || []).filter(t => now - t < 15000);
            arr.push(now);
            spamTrack.set(key, arr);
            if (arr.length >= 4) {
                spamTrack.set(key, []);
                await sock.sendMessage(from, { delete: msg.key }).catch(() => {});
                await sock.sendMessage(from, {
                    text: `🚫 @${sender.split('@')[0]} spam mat karo!`,
                    mentions: [sender],
                }).catch(() => {});
                return true;
            }
        }
        return false;
    } catch (_) { return false; }
}

/**
 * .gcstatusall / .gcall — owner inbox (DM) se sab groups mein message bhejo.
 * Text:  .gcstatusall Hello All
 * Image: kisi image ko reply karke .gcstatusall [caption]
 */
async function gcstatusallCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    if (from.endsWith('@g.us')) return sock.sendMessage(from, { text: '❌ Ye command inbox (DM) se chalao, group se nahi.' }, { quoted: msg });
    const groups = await sock.groupFetchAllParticipating().catch(() => ({}));
    const groupJids = Object.keys(groups);
    if (!groupJids.length) return sock.sendMessage(from, { text: '❌ Bot kisi group mein nahi hai.' }, { quoted: msg });
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    const quotedImg = ctx?.quotedMessage?.imageMessage;
    const text = (args || []).join(' ').trim();
    if (!text && !quotedImg) {
        return sock.sendMessage(from, { text: '❌ Usage:\n.gcstatusall Hello All\n(ya image ko reply karke .gcstatusall)' }, { quoted: msg });
    }
    let imgBuf = null;
    if (quotedImg) {
        try {
            const stream = await downloadContentFromMessage(quotedImg, 'image');
            let buf = Buffer.from([]);
            for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
            imgBuf = buf;
        } catch (_) { return sock.sendMessage(from, { text: '❌ Image download nahi hui.' }, { quoted: msg }); }
    }
    let sent = 0, failed = 0;
    for (const gj of groupJids) {
        try {
            if (imgBuf) await sock.sendMessage(gj, { image: imgBuf, caption: text || quotedImg.caption || '' });
            else await sock.sendMessage(gj, { text });
            sent++;
        } catch (_) { failed++; }
        await new Promise(r => setTimeout(r, 800)); // ban-safe delay
    }
    await sock.sendMessage(from, {
        text: `✅ *GC Status All*\n📤 Sent: ${sent} groups\n❌ Failed: ${failed}`,
    }, { quoted: msg });
}

module.exports = {
    antilinkCmd, antispamCmd, warnCmd, unwarnCmd, muteCmd, rulesCmd, gcstatusallCmd, handleModeration,
};
