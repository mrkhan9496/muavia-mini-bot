/** .menu — simple, readable command list (production bot jaisa style) */
const fs = require('fs');
const path = require('path');
const MENU_VIDEO = path.join(__dirname, '..', 'assets', 'menu-logo.mp4');

function sec(title, cmds) {
    const lines = (cmds || []).filter(Boolean).map(c => `  .${c}`);
    if (!lines.length) return '';
    return `*${title}*\n${lines.join('\n')}`;
}

async function menuCmd(sock, from, msg) {
    const sections = [
        sec('MAIN', [
            'menu — ye list',
            'ping — speed check',
        ]),
        sec('SCHEDULER', [
            'schedule <num> | <time> | <msg> — message schedule karo',
            'schedules — pending dekho',
            'cancel <id> — schedule cancel',
            'cancelall — sab cancel',
        ]),
        sec('CHANNEL', [
            'channelstatus — channel info',
            'autopost on/off — auto posting',
            'settimes 10:00,13:00 — post times',
            'postnow — abhi post karo',
            'cancelpost — aaj ke posts cancel',
            'setchannel <jid> — channel set',
            'findchannel <link> — channel dhoondo',
        ]),
        sec('AI CHATBOT', [
            'chatbot on/off/status',
            'gemini <sawal> — Gemini se poocho',
        ]),
        sec('AI ASSISTANT', [
            'ai <sawal> / ask <sawal>',
            'translate <lang> <text> — tarjuma',
            'summarize <text> — khulasa',
        ]),
        sec('CREATIVE', [
            'shayari [topic]',
            'quote [topic]',
            'caption [topic]',
        ]),
        sec('PERSONAL', [
            'remind 10m <text> — yaad dilaao',
            'reminders — list dekho',
            'unremind <id> — cancel karo',
            'todo add <task> / list / done <n> / clear',
            'note <text> — note save karo',
            'notes — notes dekho',
            'notedel <n> — note delete',
        ]),
        sec('MODERATION (groups)', [
            'antilink on/off — links delete',
            'antispam on/off — spam delete',
            'warn @user — warning do',
            'unwarn @user — warning clear',
            'mute / unmute @user',
            'rules [text] — rules set/dekho',
            'autogreet on/off — naye members ko welcome',
        ]),
        sec('TOOLS', [
            'qr <text> — QR code banao',
            'poll Sawal? | A | B — poll banao',
            'sticker — reply img ko sticker banao',
            'toimg — reply sticker ko image banao',
            'feedback <msg> — owner ko bhejo',
            'uptime — bot status',
            'apihealth — API status',
        ]),
        sec('DOWNLOAD', [
            'tiktok <link> — TikTok video',
            'insta <link> — Instagram video',
            'fb <link> — Facebook video',
            'pinterest <link>',
            'movie <naam> — info + download',
            'moviedl <id> — archive se bhejo',
            'series <naam> — series dhoondo',
            'seriesdl <id> — episode bhejo',
            'vv — view-once kholo (reply karke)',
        ]),
        sec('REALITY (random video)', [
            'mard — random video',
            'sad — random sad video',
            'baap — random baap video',
        ]),
        sec('DAILY LIFE REPLIES', [
            'salam / wsalam / subah / shab',
            'sorry / maafi',
            'shukriya / thanks',
            'ijazat',
            'respect / adab',
            'dua / khairiyat / mashallah',
            'haal / busy / ok',
            'dost / mohabbat',
            'takecare / bye / allahhafiz',
        ]),
        sec('STATUS', [
            'autostatus on/off',
            'statusreact <emoji>',
            'autoreact on/off',
        ]),
        sec('MIRROR', [
            'setsource <link> — source channel',
            'mirror on/off',
        ]),
        sec('PRIVACY', [
            'antidelete on/off',
            'onetick on/off / ghost / singletick',
        ]),
    ].filter(Boolean);

    const header =
`🤖 *BABA SAB JANTA HAI*
👑 Owner: Muavia
⚡ Total Commands: 82

`;

    const menuText = header + sections.join('\n\n');

    // Pehle video (chhoti caption ke saath), phir poora menu TEXT mein
    // (video caption sirf 1024 chars — is liye menu alag message mein)
    if (fs.existsSync(MENU_VIDEO)) {
        await sock.sendMessage(from, {
            video: fs.readFileSync(MENU_VIDEO),
            caption: '🤖 *BABA SAB JANTA HAI*',
            gifPlayback: false
        }, { quoted: msg });
    }
    await sock.sendMessage(from, { text: menuText }, { quoted: msg });
}

async function pingCmd(sock, from, msg) {
    const t = Date.now();
    await sock.sendMessage(from, { text: `🏓 Pong! ${Date.now() - t}ms` }, { quoted: msg });
}

module.exports = { menuCmd, pingCmd };
