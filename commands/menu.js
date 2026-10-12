/** .menu — boxed style (user ki exact requirement), image + text EK message mein */
const fs = require('fs');
const path = require('path');
const { getChannelContextInfo } = require('../lib/channel');
const MENU_IMAGE = path.join(__dirname, '..', 'assets', 'menu-logo.jpg');

async function menuCmd(sock, from, msg) {
    // Boxed menu — 1024 char caption limit ke andar
    const menuText =
`╭━━━〔 BABA SAB JANTA HAI 〕━━━╮
┃ 👑 Owner: Muavia
┣━━〔 📥 DOWNLOAD MENU 〕━━
┃ .tiktok .insta .facebook .pinterest
┃ .movie .moviedl .series .seriesdl .vv
┣━━〔 🤖 AI MENU 〕━━
┃ .ai .ask .gemini .chatbot
┃ .translate .summarize .shayari
┃ .quote .caption
┣━━〔 🧰 TOOLS MENU 〕━━
┃ .qr .poll .sticker .toimg .feedback
┃ .uptime .apihealth .runtime .ping
┃ .remind .todo .note .schedule
┣━━〔 🎉 FUN MENU 〕━━
┃ .mard .sad .baap
┣━━〔 ⚙️ UTILITY MENU 〕━━
┃ .menu .help .autopost .settimes
┃ .postnow .setchannel .channelstatus
┃ .antilink .antispam .warn .mute
┃ .rules .autogreet .autostatus
┃ .autoreact .antidelete .antiviewonce
┃ .alwaysonline .onetick
┃ .mirror .setsource
┣━━〔 💬 DAILY LIFE 〕━━
┃ .salam .wsalam .subah .shab
┃ .sorry .maafi .shukriya .thanks
┃ .ijazat .respect .adab .dua
┃ .khairiyat .mashallah .haal .busy
┃ .ok .dost .mohabbat .takecare
┃ .bye .allahhafiz
╰━━━━━━━━━━━━━━━━━━━━╯`;

    // Image + menu caption EK HI message mein (user ki requirement)
    // Caption limit 1024 chars — ye menu uske andar hai
    let channelCtx = {};
    try { channelCtx = await getChannelContextInfo(sock); } catch {}

    if (fs.existsSync(MENU_IMAGE)) {
        await sock.sendMessage(from, {
            image: fs.readFileSync(MENU_IMAGE),
            caption: menuText,
            ...channelCtx
        }, { quoted: msg });
    } else {
        // Image na mile to text mein bhejo
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

module.exports = { menuCmd, pingCmd, runtimeCmd };
