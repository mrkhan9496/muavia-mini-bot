/** .menu — Naveed-style boxed menu: header info box + section boxes + ✦ bullets.
 *  Image + text EK message mein (1024 char caption limit ke andar rehna LAZMI hai). */
const fs = require('fs');
const path = require('path');
const { getChannelContextInfo } = require('../lib/channel');
const MENU_IMAGE = path.join(__dirname, '..', 'assets', 'menu-logo.jpg');

// Sections — naya command aaye to yahin add karo, count khud update ho jayegi
const SECTIONS = [
    { title: '📥 DOWNLOAD', cmds: ['tiktok', 'insta', 'facebook', 'pinterest', 'movie', 'moviedl', 'series', 'seriesdl', 'vv'] },
    { title: '🤖 AI', cmds: ['ai', 'ask', 'gemini', 'chatbot', 'translate', 'summarize', 'shayari', 'quote', 'caption'] },
    { title: '🧰 TOOLS', cmds: ['qr', 'poll', 'sticker', 'toimg', 'feedback', 'uptime', 'apihealth', 'runtime', 'ping', 'remind', 'todo', 'note', 'schedule'] },
    { title: '🎉 FUN', cmds: ['mard', 'sad', 'baap'] },
    { title: '⚙️ UTILITY', cmds: ['menu', 'help', 'autopost', 'settimes', 'postnow', 'setchannel', 'channelstatus', 'antilink', 'antispam', 'warn', 'mute', 'rules', 'autogreet', 'autostatus', 'autoreact', 'antidelete', 'antiviewonce', 'alwaysonline', 'onetick', 'gs', 'mirror', 'setsource'] },
    { title: '💬 DAILY LIFE', cmds: ['salam', 'wsalam', 'subah', 'shab', 'sorry', 'maafi', 'shukriya', 'thanks', 'ijazat', 'respect', 'adab', 'dua', 'khairiyat', 'mashallah', 'haal', 'busy', 'ok', 'dost', 'mohabbat', 'takecare', 'bye', 'allahhafiz'] },
];

function buildMenuText() {
    const total = SECTIONS.reduce((n, s) => n + s.cmds.length, 0);
    const up = Math.floor(process.uptime());
    const h = Math.floor(up / 3600), m = Math.floor((up % 3600) / 60);
    const uptime = h > 0 ? `${h}h ${m}m` : `${m}m`;

    let t = `╭━━━〔 🌟 BABA SAB JANTA HAI 🌟 〕━━━╮\n` +
            `┃ 👑 Muavia  •  Prefix .  •  ${total} cmds\n` +
            `┃ ⏱️ ${uptime}  •  🛡️ public\n` +
            `╰━━━━━━━━━━━━━━━━━━━━╯`;
    for (const s of SECTIONS) {
        t += `\n┏━━〔 ⚡ ${s.title} 〕`;
        for (let i = 0; i < s.cmds.length; i += 4) {
            t += '\n┃ ' + s.cmds.slice(i, i + 4).map(c => '✦.' + c).join(' ');
        }
    }
    t += '\n┗━━━━━━━━━━━━━━';
    return t;
}

async function menuCmd(sock, from, msg) {
    const menuText = buildMenuText();

    // Safety: caption 1024 se zyada hua to text-only bhejo (image ke baghair)
    const tooLong = menuText.length > 1024;

    let channelCtx = {};
    try { channelCtx = await getChannelContextInfo(sock); } catch {}

    // Per-session DP (2026-10-17): pehle is session ki logo, na mile to default
    let menuImagePath = MENU_IMAGE;
    try {
        const sessionId = String(sock.user?.id || 'default').replace(/[^0-9a-zA-Z]/g, '_');
        const sessionLogo = path.join(__dirname, '..', 'assets', `menu-logo-${sessionId}.jpg`);
        if (fs.existsSync(sessionLogo)) menuImagePath = sessionLogo;
    } catch {}

    if (!tooLong && fs.existsSync(menuImagePath)) {
        await sock.sendMessage(from, {
            image: fs.readFileSync(menuImagePath),
            caption: menuText,
            ...channelCtx
        }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: menuText, ...channelCtx }, { quoted: msg });
    }
}

async function pingCmd(sock, from, msg) {
    const t = Date.now();
    await sock.sendMessage(from, { text: `🏓 Pong! ${Date.now() - t}ms` }, { quoted: msg });
}

async function runtimeCmd(sock, from, msg) {
    const _up = Math.floor(process.uptime());
    const _h = Math.floor(_up / 3600), _m = Math.floor((_up % 3600) / 60), _s = _up % 60;
    await sock.sendMessage(from, { text: `⏱️ Runtime: ${_h}h ${_m}m ${_s}s` }, { quoted: msg });
}

module.exports = { menuCmd, pingCmd, runtimeCmd, buildMenuText };
