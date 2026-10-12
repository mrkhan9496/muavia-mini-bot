/**
 * Anti-ViewOnce — AUTO capture.
 *
 * Jab koi view-once image/video/voice bheje, bot use foran download karke
 * OWNER ki personal chat (bot ka apna DM) mein bhej deta hai.
 * Kisi command ka intezar nahi — default ON hai.
 *
 * Commands (owner only):
 *   .antiviewonce on  | off — feature on/off
 *   .antiviewonce     — status dekho
 *
 * WIRING (index.js, onMessage mein):
 *   await antiviewonceCmds.handleViewOnce(sock, msg).catch(() => {});
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const db = require('../lib/db');

const B = {
    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
};
const toBold = (t) => String(t).split('').map(c => B[c] || c).join('');

async function isEnabled() {
    // Default ON — sirf explicit 'off' par band
    return (await db.getSetting('antiviewonce')) !== 'off';
}

async function collectBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

// ---------------- command ----------------
async function antiviewonceCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = await isEnabled();
        return sock.sendMessage(from, {
            text: `╭━━━〔 ${toBold('ANTI-VIEWONCE')} 〕━━━┈⊷\n` +
                  `┃ ⋄ ${toBold('Status:')} ${on ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `┃ ⋄ View-once image/video/voice auto-save\n` +
                  `┃   → owner ki personal chat mein\n` +
                  `┃\n` +
                  `┃ ⋄ ${toBold('.antiviewonce on')} — Enable\n` +
                  `┃ ⋄ ${toBold('.antiviewonce off')} — Disable\n` +
                  `╰━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('antiviewonce', arg);
        return sock.sendMessage(from, { text: `*Anti-viewonce ${arg === 'on' ? 'enabled ✅' : 'disabled ❌'}*` }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .antiviewonce on | off' }, { quoted: msg });
}

// ---------------- auto hook (index.js se call hota hai) ----------------
async function handleViewOnce(sock, message) {
    try {
        if (!(await isEnabled())) return;
        // Apne bheje hue messages skip (loop se bachne ke liye)
        if (message.key?.fromMe) return;

        const raw = message.message;
        if (!raw) return;

        // View-once wrappers nikalo
        const viewOnce = raw.viewOnceMessageV2 || raw.viewOnceMessage;
        if (!viewOnce?.message) return;

        const inner = viewOnce.message;
        const vType = Object.keys(inner)[0];
        if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(vType)) return;

        const media = inner[vType];
        const kind = vType.replace('Message', ''); // image | video | audio

        let buffer;
        try {
            const stream = await downloadContentFromMessage(media, kind);
            buffer = await collectBuffer(stream);
        } catch (e) { return; }
        if (!buffer?.length) return;

        // Owner ki personal chat = bot ka apna JID
        const ownerJid = sock.user?.id;
        if (!ownerJid) return;
        const { jidNormalizedUser } = require('@whiskeysockets/baileys');
        const dest = jidNormalizedUser(ownerJid);

        const sender = message.key.participant || message.key.remoteJid || '';
        const senderNum = sender.split('@')[0].split(':')[0];
        const isGroup = (message.key.remoteJid || '').endsWith('@g.us');
        const caption = `👁️ *View-once ${kind} recovered*\n👤 From: @${senderNum}${isGroup ? '\n👥 Group chat se' : ''}`;

        const sendOpts = { mentions: [sender] };
        if (kind === 'image') {
            await sock.sendMessage(dest, { image: buffer, caption, ...sendOpts });
        } else if (kind === 'video') {
            await sock.sendMessage(dest, { video: buffer, caption, ...sendOpts });
        } else {
            await sock.sendMessage(dest, { audio: buffer, mimetype: 'audio/mp4', ptt: !!media.ptt, ...sendOpts });
            await sock.sendMessage(dest, { text: caption, mentions: [sender] });
        }
        console.log(`[antiviewonce] ${kind} saved from ${senderNum}`);
    } catch (e) {}
}

module.exports = { antiviewonceCmd, handleViewOnce, isEnabled };
