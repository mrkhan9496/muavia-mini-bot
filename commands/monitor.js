/**
 * MONITORING — bot ki sehat.
 *
 * .ping      — (menu.js mein) latency check
 * .uptime    — bot kab se chal raha hai + memory
 * .apihealth — external APIs ka status (Gemini, Archive.org)
 */
const axios = require('axios');

const bootTime = Date.now();

function fmtUptime(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600),
        m = Math.floor((s % 3600) / 60), sec = s % 60;
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m) parts.push(`${m}m`);
    parts.push(`${sec}s`);
    return parts.join(' ');
}

async function uptimeCmd(sock, from, msg) {
    const mem = process.memoryUsage();
    await sock.sendMessage(from, {
        text: `⚡ *Bot Status*\n\n` +
            `🟢 Online\n` +
            `⏱️ Uptime: ${fmtUptime(Date.now() - bootTime)}\n` +
            `🧠 Memory: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}MB\n` +
            `🖥️ Node: ${process.version}`,
    }, { quoted: msg });
}

async function checkUrl(name, url, timeout = 10000) {
    const t0 = Date.now();
    try {
        await axios.get(url, { timeout, validateStatus: () => true });
        return `✅ ${name} (${Date.now() - t0}ms)`;
    } catch (e) {
        return `❌ ${name}: ${e.message.slice(0, 60)}`;
    }
}

async function apihealthCmd(sock, from, msg) {
    const geminiKey = !!process.env.GEMINI_API_KEY;
    const lines = ['🏥 *API Health:*\n'];
    lines.push(geminiKey ? '✅ Gemini API key: set' : '❌ Gemini API key: missing (.env mein GEMINI_API_KEY)');
    lines.push(await checkUrl('Archive.org', 'https://archive.org/advancedsearch.php?q=test&rows=1&output=json'));
    lines.push(await checkUrl('QR Server', 'https://api.qrserver.com/v1/create-qr-code/?size=10x10&data=test'));
    await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });
}

module.exports = { uptimeCmd, apihealthCmd };
