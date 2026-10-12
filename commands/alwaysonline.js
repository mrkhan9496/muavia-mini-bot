/**
 * Always Online — bot WhatsApp par hamesha "online" nazar aye.
 *
 * Default ON. Jab ON ho to:
 *   - Connect par foran presence 'available' bhejo
 *   - Har 25 second baad dobara bhejo (WhatsApp timeout se bachne ke liye)
 *
 * Commands (owner only):
 *   .alwaysonline on  | off
 *   .alwaysonline     — status
 *
 * WIRING (index.js):
 *   const ao = require('./commands/alwaysonline');
 *   // connection open par:
 *   ao.startPresenceLoop(sock);
 *   // command:
 *   case 'alwaysonline': return ao.alwaysonlineCmd(sock, from, msg, args, admin);
 */
const db = require('../lib/db');

const B = {
    'a': '𝗮', 'b': '𝗯', 'c': '𝗰', 'd': '𝗱', 'e': '𝗲', 'f': '𝗳', 'g': '𝗴', 'h': '𝗵', 'i': '𝗶', 'j': '𝗷', 'k': '𝗸', 'l': '𝗹', 'm': '𝗺', 'n': '𝗻', 'o': '𝗼', 'p': '𝗽', 'q': '𝗾', 'r': '𝗿', 's': '𝘀', 't': '𝘁', 'u': '𝘂', 'v': '𝘃', 'w': '𝘄', 'x': '𝘅', 'y': '𝘆', 'z': '𝘇',
    'A': '𝗔', 'B': '𝗕', 'C': '𝗖', 'D': '𝗗', 'E': '𝗘', 'F': '𝗙', 'G': '𝗚', 'H': '𝗛', 'I': '𝗜', 'J': '𝗝', 'K': '𝗞', 'L': '𝗟', 'M': '𝗠', 'N': '𝗡', 'O': '𝗢', 'P': '𝗣', 'Q': '𝗤', 'R': '𝗥', 'S': '𝗦', 'T': '𝗧', 'U': '𝗨', 'V': '𝗩', 'W': '𝗪', 'X': '𝗫', 'Y': '𝗬', 'Z': '𝗭',
};
const toBold = (t) => String(t).split('').map(c => B[c] || c).join('');

let loopTimer = null;

async function isEnabled() {
    // Default ON — sirf explicit 'off' par band
    return (await db.getSetting('alwaysonline')) !== 'off';
}

async function alwaysonlineCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
    const arg = (args[0] || '').toLowerCase();

    if (!arg) {
        const on = await isEnabled();
        return sock.sendMessage(from, {
            text: `╭━━━〔 ${toBold('ALWAYS ONLINE')} 〕━━━┈⊷\n` +
                  `┃ ⋄ ${toBold('Status:')} ${on ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `┃\n` +
                  `┃ ⋄ ${toBold('.alwaysonline on')} — Enable\n` +
                  `┃ ⋄ ${toBold('.alwaysonline off')} — Disable\n` +
                  `╰━━━━━━━━━━━━━━━━━━┈⊷`
        }, { quoted: msg });
    }
    if (arg === 'on' || arg === 'off') {
        await db.setSetting('alwaysonline', arg);
        if (arg === 'on') startPresenceLoop(sock);
        else stopPresenceLoop();
        return sock.sendMessage(from, { text: `*Always-online ${arg === 'on' ? 'enabled ✅' : 'disabled ❌'}*` }, { quoted: msg });
    }
    return sock.sendMessage(from, { text: '❌ Usage: .alwaysonline on | off' }, { quoted: msg });
}

function startPresenceLoop(sock) {
    stopPresenceLoop();
    const tick = async () => {
        try {
            if (await isEnabled()) {
                await sock.sendPresenceUpdate('available');
            }
        } catch (e) {}
    };
    tick(); // foran ek dafa
    loopTimer = setInterval(tick, 25000); // har 25s
    console.log('[alwaysonline] presence loop started');
}

function stopPresenceLoop() {
    if (loopTimer) { clearInterval(loopTimer); loopTimer = null; }
}

module.exports = { alwaysonlineCmd, startPresenceLoop, stopPresenceLoop, isEnabled };
