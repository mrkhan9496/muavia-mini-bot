/**
 * .qr <text> — text/link ka QR code banao (image).
 * Free API: api.qrserver.com (no key needed).
 *
 * Example: .qr https://github.com/mrkhan9496/muavia-mini-bot
 *          .qr Assalam o Alaikum
 */
const axios = require('axios');

async function qrCmd(sock, from, msg, args) {
    const text = (args || []).join(' ').trim();
    if (!text) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.qr <text ya link>\nExample: .qr https://google.com',
        }, { quoted: msg });
    }
    if (text.length > 500) {
        return sock.sendMessage(from, { text: '❌ Text 500 characters se kam ho.' }, { quoted: msg });
    }
    try {
        const url = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(text)}`;
        const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 20000 });
        await sock.sendMessage(from, {
            image: Buffer.from(res.data),
            caption: `🔳 *QR Code:*\n${text.slice(0, 200)}`,
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ QR banane mein error: ' + e.message }, { quoted: msg });
    }
}

module.exports = { qrCmd };
