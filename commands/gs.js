/**
 * .gs — GROUP STATUS SYSTEM (bot-based).
 *
 * WhatsApp mein native "Group Status" ka koi API nahi hai (Baileys mein sirf
 * status@broadcast hai jo personal Status ke liye hai). Is liye ye bot-based
 * system hai: members command se apna text/image/video status post karte hain,
 * bot use DB mein save karta hai aur group mein sab dekh sakte hain.
 *
 * Commands (sirf groups mein):
 *   .gs                        — professional menu
 *   .gs post <text>            — text status post karo
 *   .gs post                   — (image/video par reply karke) media status
 *   .gs list                   — latest 10 statuses dekho
 *   .gs view <id>              — koi khaas status dekho
 *   .gs del <id>               — apna status delete karo
 *   .gs clear                  — admin: group ke sab statuses saaf karo
 *
 * Storage: lib/db (group_statuses table, Postgres) + media ./data/statuses/
 */
const fs = require('fs');
const path = require('path');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { writeFile } = require('fs/promises');
const db = require('../lib/db');

const STATUS_DIR = path.join(process.cwd(), 'data', 'statuses');
if (!fs.existsSync(STATUS_DIR)) fs.mkdirSync(STATUS_DIR, { recursive: true });

// Purane status media (7 din se purane) saaf karo — har ghante
setInterval(() => {
    try {
        const now = Date.now();
        for (const f of fs.readdirSync(STATUS_DIR)) {
            const p = path.join(STATUS_DIR, f);
            try {
                const st = fs.statSync(p);
                if (st.isFile() && now - st.mtimeMs > 7 * 24 * 60 * 60 * 1000) fs.unlinkSync(p);
            } catch (e) {}
        }
    } catch (e) {}
}, 60 * 60 * 1000);

const B = {
    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
    '0': '𝟬', '1': '𝟭', '2': '𝟮', '3': '𝟯', '4': '𝟰', '5': '𝟱', '6': '𝟲', '7': '𝟳', '8': '𝟴', '9': '𝟵'
};
const toBold = (t) => String(t).split('').map(c => B[c] || c).join('');
const FOOTER = '\n\n> *Power by MR Muavia Mini bot*';

function fmtTime(iso) {
    try {
        const d = new Date(iso);
        return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
    } catch (e) { return ''; }
}

function senderNameOf(sock, msg) {
    try {
        const jid = msg.key.participant || msg.key.remoteJid || '';
        return jid.split('@')[0].split(':')[0];
    } catch (e) { return 'Unknown'; }
}

async function downloadBuffer(mediaMsg, kind) {
    const stream = await downloadContentFromMessage(mediaMsg, kind);
    let buf = Buffer.from([]);
    for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
    return buf;
}

function menuText() {
    return `╭━━━〔 ${toBold('GROUP STATUS')} 〕━━━┈⊷\n` +
        `┃ ${toBold('Apna status group mein share karo!')}\n` +
        `┃\n` +
        `┃ 📝 ${toBold('.gs post <text>')}\n` +
        `┃ ┗ Text status post karo\n` +
        `┃\n` +
        `┃ 🖼️ ${toBold('.gs post')} ${toBold('(image/video par reply)')}\n` +
        `┃ ┗ Media status post karo\n` +
        `┃\n` +
        `┃ 📋 ${toBold('.gs list')}\n` +
        `┃ ┗ Latest 10 statuses dekho\n` +
        `┃\n` +
        `┃ 👀 ${toBold('.gs view <id>')}\n` +
        `┃ ┗ Koi khaas status dekho\n` +
        `┃\n` +
        `┃ 🗑️ ${toBold('.gs del <id>')}\n` +
        `┃ ┗ Apna status delete karo\n` +
        `┃\n` +
        `┃ 🧹 ${toBold('.gs clear')} ${toBold('(admin)')}\n` +
        `┃ ┗ Sab statuses saaf karo\n` +
        `╰━━━━━━━━━━━━━━━━━━┈⊷` + FOOTER;
}

async function gsCmd(sock, from, msg, args, isAdmin) {
    // Sirf groups mein
    if (!from.endsWith('@g.us')) {
        return sock.sendMessage(from, { text: `❌ ${toBold('Ye command sirf groups mein kaam karti hai.')}` + FOOTER }, { quoted: msg });
    }

    const sub = (args[0] || '').toLowerCase();
    const senderJid = msg.key.participant || msg.key.remoteJid;
    const senderName = senderNameOf(sock, msg);

    // ---- menu ----
    if (!sub) {
        return sock.sendMessage(from, { text: menuText() }, { quoted: msg });
    }

    // ---- post ----
    if (sub === 'post') {
        const text = args.slice(1).join(' ').trim();
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        // Media status (reply to image/video)
        if (quoted && (quoted.imageMessage || quoted.videoMessage)) {
            const isImg = !!quoted.imageMessage;
            const mediaMsg = isImg ? quoted.imageMessage : quoted.videoMessage;
            const kind = isImg ? 'image' : 'video';
            let mediaPath = '';
            try {
                const buf = await downloadBuffer(mediaMsg, kind);
                if (!buf.length) throw new Error('empty');
                const ext = isImg ? 'jpg' : 'mp4';
                mediaPath = path.join(STATUS_DIR, `gs_${Date.now()}_${Math.floor(Math.random() * 1e6)}.${ext}`);
                await writeFile(mediaPath, buf);
            } catch (e) {
                return sock.sendMessage(from, { text: '❌ Media download nahi ho saka.' + FOOTER }, { quoted: msg });
            }
            const caption = mediaMsg.caption || text || '';
            const id = await db.gsAdd(from, senderJid, senderName, kind, caption, mediaPath);
            return sock.sendMessage(from, {
                text: `✅ ${toBold('Status post ho gaya!')} (#${id})\n👤 ${toBold('By:')} @${senderName}` + FOOTER,
                mentions: [senderJid]
            }, { quoted: msg });
        }

        // Text status
        if (!text) {
            return sock.sendMessage(from, {
                text: `❌ ${toBold('Usage:')}\n.gspost <text> — text status\n.gspost — (image/video par reply karke)` + FOOTER
            }, { quoted: msg });
        }
        if (text.length > 500) {
            return sock.sendMessage(from, { text: '❌ Status 500 characters se zyada nahi ho sakta.' + FOOTER }, { quoted: msg });
        }
        const id = await db.gsAdd(from, senderJid, senderName, 'text', text, '');
        return sock.sendMessage(from, {
            text: `✅ ${toBold('Status post ho gaya!')} (#${id})\n👤 ${toBold('By:')} @${senderName}` + FOOTER,
            mentions: [senderJid]
        }, { quoted: msg });
    }

    // ---- list ----
    if (sub === 'list') {
        const list = await db.gsList(from, 10);
        if (!list.length) {
            return sock.sendMessage(from, { text: `📭 ${toBold('Abhi koi status nahi hai.')}\n.gspost se pehla status post karo!` + FOOTER }, { quoted: msg });
        }
        let out = `╭━━━〔 ${toBold('LATEST STATUSES')} 〕━━━┈⊷\n`;
        for (const s of list) {
            const icon = s.type === 'image' ? '🖼️' : s.type === 'video' ? '🎬' : '📝';
            const preview = s.type === 'text'
                ? (s.content.length > 60 ? s.content.slice(0, 60) + '…' : s.content)
                : (s.content ? s.content.slice(0, 40) : `${s.type} status`);
            out += `┃\n┃ ${icon} ${toBold('#' + s.id)} — @${s.sender_name}\n┃ ┗ ${preview}\n┃ ┗ 🕐 ${fmtTime(s.created_at)}\n`;
        }
        out += `╰━━━━━━━━━━━━━━━━━━┈⊷\n\n👀 Dekhne ke liye: ${toBold('.gs view <id>')}` + FOOTER;
        const mentions = [...new Set(list.map(s => s.sender_jid).filter(Boolean))];
        return sock.sendMessage(from, { text: out, mentions }, { quoted: msg });
    }

    // ---- view ----
    if (sub === 'view') {
        const id = parseInt(args[1], 10);
        if (!id) return sock.sendMessage(from, { text: `❌ ${toBold('Usage:')} .gsview <id>` + FOOTER }, { quoted: msg });
        const s = await db.gsGet(id, from);
        if (!s) return sock.sendMessage(from, { text: '❌ Status nahi mila.' + FOOTER }, { quoted: msg });

        const head = `👤 ${toBold('By:')} @${s.sender_name}\n🕐 ${toBold('At:')} ${fmtTime(s.created_at)}`;
        const mentions = [s.sender_jid].filter(Boolean);
        if (s.type === 'text') {
            return sock.sendMessage(from, { text: `📝 ${toBold('STATUS #' + s.id)}\n\n${s.content}\n\n${head}` + FOOTER, mentions }, { quoted: msg });
        }
        // media
        if (s.media_path && fs.existsSync(s.media_path)) {
            const cap = `📎 ${toBold('STATUS #' + s.id)}\n${s.content ? s.content + '\n' : ''}\n${head}` + FOOTER;
            if (s.type === 'image') return sock.sendMessage(from, { image: { url: s.media_path }, caption: cap, mentions }, { quoted: msg });
            if (s.type === 'video') return sock.sendMessage(from, { video: { url: s.media_path }, caption: cap, mentions }, { quoted: msg });
        }
        return sock.sendMessage(from, { text: '⚠️ Is status ka media ab maujood nahi.' + FOOTER }, { quoted: msg });
    }

    // ---- del (apna status) ----
    if (sub === 'del' || sub === 'delete') {
        const id = parseInt(args[1], 10);
        if (!id) return sock.sendMessage(from, { text: `❌ ${toBold('Usage:')} .gsdel <id>` + FOOTER }, { quoted: msg });
        const s = await db.gsGet(id, from);
        if (!s) return sock.sendMessage(from, { text: '❌ Status nahi mila.' + FOOTER }, { quoted: msg });
        if (s.sender_jid !== senderJid && !isAdmin) {
            return sock.sendMessage(from, { text: '❌ Sirf apna status delete kar sakte ho.' + FOOTER }, { quoted: msg });
        }
        const ok = await db.gsDelete(id, from, s.sender_jid);
        if (ok && s.media_path) { try { fs.unlinkSync(s.media_path); } catch (e) {} }
        return sock.sendMessage(from, { text: ok ? `✅ ${toBold('Status #' + id + ' delete ho gaya.')}` + FOOTER : '❌ Delete nahi ho saka.' + FOOTER }, { quoted: msg });
    }

    // ---- clear (admin) ----
    if (sub === 'clear') {
        if (!isAdmin) return sock.sendMessage(from, { text: '❌ Sirf admin sab statuses saaf kar sakta hai.' + FOOTER }, { quoted: msg });
        const paths = await db.gsClear(from);
        for (const p of paths) { try { fs.unlinkSync(p); } catch (e) {} }
        return sock.sendMessage(from, { text: `🧹 ${toBold('Sab statuses saaf kar diye gaye!')}` + FOOTER }, { quoted: msg });
    }

    return sock.sendMessage(from, { text: menuText() }, { quoted: msg });
}

module.exports = { gsCmd };
