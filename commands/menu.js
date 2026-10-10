/** .menu — MR MUAVIA MD BOT wala exact style (JAWAD boxes + small-caps) */
const fs = require('fs');
const path = require('path');
const MENU_VIDEO = path.join(__dirname, '..', 'assets', 'menu-logo.mp4');

const _scMap = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
const toSmallCaps = (s) => String(s || '').toLowerCase().split('').map(ch => _scMap[ch] || ch).join('');

function jSec(title, cmds) {
    const lines = (cmds || []).filter(Boolean).map(c => `*┋ ⬡ ${toSmallCaps(c)}*`);
    if (!lines.length) return '';
    return '`『 ' + title + ' 』`\n╭───────────────────⊷\n' + lines.join('\n') + '\n╰───────────────────⊷';
}

async function menuCmd(sock, from, msg) {
    const menuSections = [];

    const push = (title, cmds) => {
        const s = jSec(title, cmds);
        if (s) menuSections.push(s);
    };

    push('MAIN', [
        'menu',
        'ping',
        'runtime',
        'uptime',
    ]);
    push('SCHEDULER', [
        'schedule <num> | <time> | <msg>',
        'schedules',
        'cancel <id>',
        'cancelall',
    ]);
    push('CHANNEL', [
        'channelstatus',
        'autopost on/off',
        'settimes 10:00,13:00',
        'postnow',
        'cancelpost',
        'setchannel <jid>',
        'findchannel <link>',
    ]);
    push('AI CHATBOT', [
        'chatbot on/off/status',
        'gemini <sawal>',
    ]);
    push('AI ASSISTANT', [
        'ai <sawal> / ask <sawal>',
        'translate <lang> <text>',
        'summarize <text>',
    ]);
    push('CREATIVE', [
        'shayari [topic]',
        'quote [topic]',
        'caption [topic]',
    ]);
    push('PERSONAL', [
        'remind 10m <text>',
        'reminders / unremind <id>',
        'todo add/list/done/clear',
        'note <text> / notes / notedel',
    ]);
    push('MODERATION', [
        'antilink on/off',
        'antispam on/off',
        'warn @user / unwarn',
        'mute / unmute @user',
        'rules [text]',
        'autogreet on/off',
    ]);
    push('TOOLS', [
        'qr <text>',
        'poll Q? | A | B',
        'sticker (reply img)',
        'toimg (reply sticker)',
        'feedback <msg>',
        'apihealth',
    ]);
    push('DOWNLOAD', [
        'tiktok <link>',
        'insta <link>',
        'fb <link>',
        'pinterest <link>',
        'movie <naam>',
        'moviedl <id>',
        'series <naam>',
        'seriesdl <id>',
        'vv (view-once reply)',
    ]);
    push('REALITY', [
        'mard',
        'sad',
        'baap',
    ]);
    push('DAILY LIFE REPLIES', [
        'salam / wsalam / subah / shab',
        'sorry / maafi',
        'shukriya / thanks',
        'ijazat',
        'respect / adab',
        'dua / khairiyat / mashallah',
        'haal / busy / ok',
        'dost / mohabbat',
        'takecare / bye / allahhafiz',
    ]);
    push('STATUS', [
        'autostatus on/off',
        'statusreact <emoji>',
        'autoreact on/off',
    ]);
    push('MIRROR', [
        'setsource <link>',
        'mirror on/off',
    ]);
    push('PRIVACY', [
        'antidelete on/off',
        'onetick on/off',
    ]);

    // Command count (production bot jaisa dynamic)
    const cmdCount = menuSections.reduce((n, s) => n + (s.match(/┋ ⬡/g) || []).length, 0);
    const _up = Math.floor(process.uptime());
    const _uh = Math.floor(_up / 3600), _um = Math.floor((_up % 3600) / 60), _us = _up % 60;
    const _uptimeStr = `${_uh}h ${_um}m ${_us}s`;

    const menuText =
        `*╭┈───〔 BABA SAB JANTA HAI 〕┈───⊷*\n` +
        `*├✦ Owner:* Muavia\n` +
        `*├✦ Commands:* ${cmdCount}\n` +
        `*├✦ Runtime:* ${_uptimeStr}\n` +
        `*├✦ Prefix:* .\n` +
        `*├✦ Mode:* private\n` +
        `*├✦ Version:* 1.0.0\n` +
        `*╰───────────────────⊷*\n\n` +
        menuSections.join('\n\n') + '\n\n' +
        `> *© ᴘᴏᴡᴇʀᴇᴅ ʙʏ MR MUAVIA MINI BOT*`;

    // Pehle video (chhoti caption), phir poora menu TEXT mein
    // (video caption 1024 chars par kat jata hai — is liye alag message)
    if (fs.existsSync(MENU_VIDEO)) {
        await sock.sendMessage(from, {
            video: fs.readFileSync(MENU_VIDEO),
            caption: '🤖 *BABA SAB JANTA HAI*',
            gifPlayback: true // GIF mode: video khud-ba-khud chalegi, play dabane ki zaroorat nahi
        }, { quoted: msg });
    }
    await sock.sendMessage(from, { text: menuText }, { quoted: msg });
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
