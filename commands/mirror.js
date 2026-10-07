/**
 * Channel Mirror — source channel se posts copy karke apne channel par repost.
 *
 * Commands (owner only):
 *   .setsource <channel link>  — source (history) channel set karo + follow karo
 *   .mirror on/off             — auto-mirror on/off
 *   .mirror                    — status dekho
 *
 * Kaam kaise karta hai:
 *   1. Bot source channel ko follow karta hai (newsletterFollow)
 *   2. Jab source par nayi post aati hai, bot usay foran apne channel par
 *      repost karta hai — upar header, neeche apni branding ke saath
 *   3. Har message ID track hoti hai taake duplicate post na ho
 *
 * Settings (lib/db): 'source_channel_jid', 'mirror' on|off, 'mirrored_ids' (JSON list)
 */
const db = require('../lib/db');

const HEADER = '📜 *Tareekh Ke Panno Se* 📜\n\n';
const FOOTER = '\n\n> ━━━━━━━━━━━━━━━\n> 📢 *BABA SAB JANTA HAI*';

async function getSourceJid() {
    return (await db.getSetting('source_channel_jid')) || '';
}

async function getOwnChannelJid() {
    return (await db.getSetting('channel_jid')) || process.env.CHANNEL_JID || '';
}

async function isMirrored(msgId) {
    try {
        const raw = await db.getSetting('mirrored_ids');
        const list = raw ? JSON.parse(raw) : [];
        return list.includes(msgId);
    } catch { return false; }
}

async function markMirrored(msgId) {
    try {
        const raw = await db.getSetting('mirrored_ids');
        let list = raw ? JSON.parse(raw) : [];
        list.push(msgId);
        if (list.length > 200) list = list.slice(-200); // sirf aakhri 200 yaad rakho
        await db.setSetting('mirrored_ids', JSON.stringify(list));
    } catch {}
}

function extractText(msg) {
    const m = msg.message || {};
    return m.conversation
        || m.extendedTextMessage?.text
        || m.imageMessage?.caption
        || m.videoMessage?.caption
        || '';
}

// Source channel ki post ko apne channel par repost karo (branding ke saath)
async function mirrorMessage(sock, msg) {
    const ownJid = await getOwnChannelJid();
    if (!ownJid) {
        console.error('[mirror] apna channel set nahi — .setchannel pehle chalao');
        return;
    }
    const msgId = msg.key?.id;
    if (!msgId || await isMirrored(msgId)) return; // duplicate skip
    await markMirrored(msgId);

    const m = msg.message || {};
    try {
        if (m.imageMessage) {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buf = await downloadMediaMessage(msg, 'buffer', {});
            const caption = HEADER + extractText(msg) + FOOTER;
            await sock.sendMessage(ownJid, { image: buf, caption });
        } else if (m.videoMessage) {
            const { downloadMediaMessage } = require('@whiskeysockets/baileys');
            const buf = await downloadMediaMessage(msg, 'buffer', {});
            const caption = HEADER + extractText(msg) + FOOTER;
            await sock.sendMessage(ownJid, { video: buf, caption });
        } else {
            const text = extractText(msg);
            if (!text) return;
            await sock.sendMessage(ownJid, { text: HEADER + text + FOOTER });
        }
        const n = parseInt(await db.getSetting('mirror_count') || '0', 10) + 1;
        await db.setSetting('mirror_count', String(n));
        console.log(`[mirror] reposted #${n} from source channel`);
    } catch (e) {
        console.error('[mirror] repost failed:', e.message);
    }
}

async function handleMirrorMessage(sock, msg) {
    try {
        if ((await db.getSetting('mirror')) !== 'on') return;
        const sourceJid = await getSourceJid();
        if (!sourceJid) return;
        if (msg.key?.remoteJid !== sourceJid) return;
        await mirrorMessage(sock, msg);
    } catch (e) {}
}

async function setsourceCmd(sock, from, msg, args) {
    const raw = (args[0] || '').trim();
    if (!raw) {
        return sock.sendMessage(from, { text:
            '❌ Usage: .setsource <channel link>\n\n' +
            'History channel ka invite link bhejo:\n' +
            '.setsource https://whatsapp.com/channel/0029VbXXXX...'
        }, { quoted: msg });
    }
    const m = raw.match(/channel\/([A-Za-z0-9]+)/);
    const code = m ? m[1] : raw.replace(/[^A-Za-z0-9]/g, '');
    if (!code) return sock.sendMessage(from, { text: '❌ Invite code samajh nahi aya.' }, { quoted: msg });

    await sock.sendMessage(from, { text: '🔍 Source channel dhoond raha hun...' }, { quoted: msg });
    try {
        const meta = await sock.newsletterMetadata('invite', code);
        const jid = meta?.id || meta?.result?.id;
        const name = meta?.thread_metadata?.name?.text || meta?.name || '';
        if (!jid) throw new Error('JID nahi mili');
        await db.setSetting('source_channel_jid', jid);
        // Follow karo taake nayi posts foran milein
        try { await sock.newsletterFollow(jid); } catch (e) {
            console.error('[mirror] follow failed:', e.message);
        }
        await sock.sendMessage(from, { text:
            `✅ Source channel set${name ? ': *' + name + '*' : ''}!\n\n` +
            `🔗 Follow kar liya — ab iski nayi posts auto-mirror hongi.\n\n` +
            `.mirror on — mirror shuru karo`
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Channel nahi mili: ' + e.message }, { quoted: msg });
    }
}

async function mirrorCmd(sock, from, msg, args) {
    const arg = (args[0] || '').toLowerCase();
    if (!arg) {
        const on = (await db.getSetting('mirror')) === 'on';
        const source = await getSourceJid();
        const count = await db.getSetting('mirror_count') || '0';
        return sock.sendMessage(from, { text:
            `🪞 *CHANNEL MIRROR*\n\n` +
            `Status: ${on ? '✅ ON' : '❌ OFF'}\n` +
            `Source: ${source ? '✅ set' : '❌ not set'}\n` +
            `Mirrored posts: ${count}\n\n` +
            `*Usage:*\n.setsource <link> — source channel lagao\n` +
            `.mirror on/off — mirror on/off`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        if (arg === 'on' && !(await getSourceJid())) {
            return sock.sendMessage(from, { text: '❌ Pehle .setsource se source channel lagao!' }, { quoted: msg });
        }
        await db.setSetting('mirror', arg);
        // ON karte waqt follow confirm karo
        if (arg === 'on') {
            try { await sock.newsletterFollow(await getSourceJid()); } catch {}
        }
        return sock.sendMessage(from, { text:
            arg === 'on'
                ? '🪞 *Mirror ON!*\nAb source channel ki har nayi post tumhare channel par auto-repost hogi! 🎉'
                : '🪞 *Mirror OFF!*'
        }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .mirror on | off' }, { quoted: msg });
}

module.exports = { setsourceCmd, mirrorCmd, handleMirrorMessage, getSourceJid };
