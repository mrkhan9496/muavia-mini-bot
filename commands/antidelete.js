/**
 * .antidelete on | off — Anti-delete.
 *
 * When enabled, every incoming message (text/image/video/audio/sticker) is
 * buffered. When someone deletes a message (revoke), the bot forwards the
 * original content + media to the OWNER's own chat.
 *
 * WIRING (index.js, by parent):
 *   const ad = require('./commands/antidelete');
 *   // in onMessage, for every incoming msg (before command handling):
 *   await ad.storeMessage(sock, msg);
 *   // when msg.message?.protocolMessage?.type === 0 (revoke):
 *   await ad.handleMessageRevocation(sock, msg);
 *
 * Storage is in-memory only; restarts lose buffered messages (deletes
 * normally arrive seconds after the original, so this is acceptable).
 * Media temp files live in ./tmp and are auto-cleaned over 100MB.
 */
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const db = require('../lib/db');

const store = new Map(); // messageId -> { content, mediaType, mediaPath, sender, group, timestamp }
const TEMP_MEDIA_DIR = path.join(process.cwd(), 'tmp');
if (!fs.existsSync(TEMP_MEDIA_DIR)) fs.mkdirSync(TEMP_MEDIA_DIR, { recursive: true });

const B = {
    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
};
const toBold = (t) => String(t).split('').map(c => B[c] || c).join('');

setInterval(() => {
    try {
        const files = fs.readdirSync(TEMP_MEDIA_DIR);
        let total = 0;
        for (const f of files) {
            const p = path.join(TEMP_MEDIA_DIR, f);
            if (fs.statSync(p).isFile()) total += fs.statSync(p).size;
        }
        if (total > 100 * 1024 * 1024) {
            for (const f of files) { try { fs.unlinkSync(path.join(TEMP_MEDIA_DIR, f)); } catch (e) {} }
        }
    } catch (e) {}
}, 60 * 1000);

async function downloadBuffer(msgContent, type) {
    const stream = await downloadContentFromMessage(msgContent, type);
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return buf;
}

async function isEnabled() {
    return (await db.getSetting('antidelete')) === 'on';
}

// ---------------- command ----------------
async function antideleteCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = await isEnabled();
        return sock.sendMessage(from, {
            text: `╭━━━〔 ${toBold('ANTI-DELETE')} 〕━━━┈⊷\n` +
                  `┃ ⋄ ${toBold('Status:')} ${on ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `┃\n` +
                  `┃ ⋄ ${toBold('.antidelete on')} — Enable\n` +
                  `┃ ⋄ ${toBold('.antidelete off')} — Disable\n` +
                  `╰━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('antidelete', arg);
        return sock.sendMessage(from, { text: `*Anti-delete ${arg === 'on' ? 'enabled ✅' : 'disabled ❌'}*` }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .antidelete on | off' }, { quoted: msg });
}

// ---------------- hooks (called from index.js) ----------------
async function storeMessage(sock, message) {
    try {
        if (!(await isEnabled())) return;
        const messageId = message.key?.id;
        if (!messageId) return;

        const msg = message.message?.ephemeralMessage?.message ||
                    message.message?.viewOnceMessage?.message ||
                    message.message?.viewOnceMessageV2?.message ||
                    message.message;
        if (!msg) return;

        let content = '', mediaType = '', mediaPath = '';
        const sender = message.key.participant || message.key.remoteJid;

        if (msg.conversation) {
            content = msg.conversation;
        } else if (msg.extendedTextMessage?.text) {
            content = msg.extendedTextMessage.text;
        } else if (msg.imageMessage) {
            mediaType = 'image'; content = msg.imageMessage.caption || '';
            try {
                mediaPath = path.join(TEMP_MEDIA_DIR, `ad_${messageId}.jpg`);
                await writeFile(mediaPath, await downloadBuffer(msg.imageMessage, 'image'));
            } catch (e) { mediaPath = ''; }
        } else if (msg.videoMessage) {
            mediaType = 'video'; content = msg.videoMessage.caption || '';
            try {
                mediaPath = path.join(TEMP_MEDIA_DIR, `ad_${messageId}.mp4`);
                await writeFile(mediaPath, await downloadBuffer(msg.videoMessage, 'video'));
            } catch (e) { mediaPath = ''; }
        } else if (msg.audioMessage) {
            mediaType = 'audio';
            try {
                mediaPath = path.join(TEMP_MEDIA_DIR, `ad_${messageId}.mp3`);
                await writeFile(mediaPath, await downloadBuffer(msg.audioMessage, 'audio'));
            } catch (e) { mediaPath = ''; }
        } else if (msg.stickerMessage) {
            mediaType = 'sticker';
            try {
                mediaPath = path.join(TEMP_MEDIA_DIR, `ad_${messageId}.webp`);
                await writeFile(mediaPath, await downloadBuffer(msg.stickerMessage, 'sticker'));
            } catch (e) { mediaPath = ''; }
        } else {
            return; // unsupported type — nothing to store
        }

        store.set(messageId, {
            content, mediaType, mediaPath, sender,
            group: message.key.remoteJid?.endsWith('@g.us') ? message.key.remoteJid : null,
            timestamp: new Date().toISOString(),
        });
    } catch (e) {}
}

async function handleMessageRevocation(sock, revocationMessage) {
    try {
        if (!(await isEnabled())) return;
        const messageId = revocationMessage.message?.protocolMessage?.key?.id;
        if (!messageId) return;

        const original = store.get(messageId);
        if (!original) return;

        const deletedBy = revocationMessage.participant || revocationMessage.key?.participant || revocationMessage.key?.remoteJid || '';
        const ownerJid = sock.user?.id;
        const ownerNumber = ownerJid ? ownerJid.split(':')[0].split('@')[0] + '@s.whatsapp.net' : null;
        // ignore own deletes
        if (ownerJid && (deletedBy.includes(ownerJid.split(':')[0]) || (ownerNumber && deletedBy === ownerNumber))) return;

        const senderName = original.sender.split('@')[0];
        let report = `╭━━━〔 ${toBold('ANTI-DELETE REPORT')} 〕━━━┈⊷\n` +
                     `┃ 👤 ${toBold('Sender:')} @${senderName}\n` +
                     `┃ 🗑️ ${toBold('Deleted By:')} @${deletedBy.split('@')[0]}\n` +
                     `┃ 📂 ${toBold('Type:')} ${original.mediaType || 'Text'}\n` +
                     `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n`;
        if (original.content) report += `📝 ${toBold('Message:')}\n${original.content}`;
        else if (!original.mediaType) report += '⚠️ No text content was captured.';

        const dest = ownerNumber || revocationMessage.key.remoteJid;
        try {
            await sock.sendMessage(dest, { text: report, mentions: [deletedBy, original.sender] });
        } catch (e) {}

        if (original.mediaType && original.mediaPath && fs.existsSync(original.mediaPath)) {
            const mediaOptions = { caption: `*Deleted ${original.mediaType}* from @${senderName}`, mentions: [original.sender] };
            try {
                if (original.mediaType === 'image') await sock.sendMessage(dest, { image: { url: original.mediaPath }, ...mediaOptions });
                else if (original.mediaType === 'video') await sock.sendMessage(dest, { video: { url: original.mediaPath }, ...mediaOptions });
                else if (original.mediaType === 'audio') await sock.sendMessage(dest, { audio: { url: original.mediaPath }, mimetype: 'audio/mp4', ...mediaOptions });
                else if (original.mediaType === 'sticker') await sock.sendMessage(dest, { sticker: { url: original.mediaPath }, ...mediaOptions });
            } catch (e) {}
            setTimeout(() => { try { fs.unlinkSync(original.mediaPath); } catch (e) {} }, 5000);
        }
        store.delete(messageId);
    } catch (e) {}
}

module.exports = { antideleteCmd, storeMessage, handleMessageRevocation };
