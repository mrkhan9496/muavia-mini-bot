/** .menu — bilkul simple style: har command alag line mein, saaf-saaf */
const fs = require('fs');
const path = require('path');
const { getChannelContextInfo } = require('../lib/channel');
const MENU_VIDEO = path.join(__dirname, '..', 'assets', 'menu-logo.mp4');

function sec(title, cmds) {
    const lines = (cmds || []).filter(Boolean).map(c => `.${c}`);
    if (!lines.length) return '';
    return `*${title}*\n${lines.join('\n')}`;
}

async function menuCmd(sock, from, msg) {
    const menuSections = [];

    const push = (title, cmds) => {
        const s = sec(title, cmds);
        if (s) menuSections.push(s);
    };

    push('MAIN', [
        'menu',
        'ping',
        'runtime',
        'uptime',
    ]);
    push('SCHEDULER', [
        'schedule',
        'schedules',
        'cancel',
        'cancelall',
    ]);
    push('CHANNEL', [
        'channelstatus',
        'autopost',
        'settimes',
        'postnow',
        'cancelpost',
        'setchannel',
        'findchannel',
    ]);
    push('AI CHATBOT', [
        'chatbot',
        'gemini',
    ]);
    push('AI ASSISTANT', [
        'ai',
        'ask',
        'translate',
        'summarize',
    ]);
    push('CREATIVE', [
        'shayari',
        'quote',
        'caption',
    ]);
    push('PERSONAL', [
        'remind',
        'reminders',
        'unremind',
        'todo',
        'note',
        'notes',
        'notedel',
    ]);
    push('MODERATION', [
        'antilink',
        'antispam',
        'warn',
        'unwarn',
        'mute',
        'unmute',
        'rules',
        'autogreet',
    ]);
    push('TOOLS', [
        'qr',
        'poll',
        'sticker',
        'toimg',
        'feedback',
        'apihealth',
    ]);
    push('DOWNLOAD', [
        'tiktok',
        'insta',
        'fb',
        'pinterest',
        'movie',
        'moviedl',
        'series',
        'seriesdl',
        'vv',
    ]);
    push('REALITY', [
        'mard',
        'sad',
        'baap',
    ]);
    push('DAILY LIFE', [
        'salam',
        'wsalam',
        'subah',
        'shab',
        'sorry',
        'maafi',
        'shukriya',
        'thanks',
        'ijazat',
        'respect',
        'adab',
        'dua',
        'khairiyat',
        'mashallah',
        'haal',
        'busy',
        'ok',
        'dost',
        'mohabbat',
        'takecare',
        'bye',
        'allahhafiz',
    ]);
    push('STATUS', [
        'autostatus',
        'statusreact',
        'autoreact',
    ]);
    push('MIRROR', [
        'setsource',
        'mirror',
    ]);
    push('PRIVACY', [
        'antidelete',
        'onetick',
    ]);

    const cmdCount = menuSections.reduce((n, s) => n + (s.match(/^\./gm) || []).length, 0);

    const menuText =
        `🤖 *BABA SAB JANTA HAI*\n` +
        `👑 Owner: Muavia\n` +
        `⚡ Commands: ${cmdCount}\n\n` +
        menuSections.join('\n\n');

    // Pehle video (GIF auto-play), phir poora menu TEXT mein
    let channelCtx = {};
    try { channelCtx = await getChannelContextInfo(sock); } catch {}
    if (fs.existsSync(MENU_VIDEO)) {
        await sock.sendMessage(from, {
            video: fs.readFileSync(MENU_VIDEO),
            caption: '🤖 *BABA SAB JANTA HAI*',
            gifPlayback: true,
            ...channelCtx
        }, { quoted: msg });
    }
    await sock.sendMessage(from, { text: menuText, ...channelCtx }, { quoted: msg });
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
