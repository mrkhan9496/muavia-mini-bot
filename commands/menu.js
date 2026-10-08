/** .menu — command list (JAWAD-style boxes, BABA SAB JANTA HAI branding) */
const fs = require('fs');
const path = require('path');
const _scMap = {a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'s',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};
const toSmallCaps = (s) => String(s || '').toLowerCase().split('').map(ch => _scMap[ch] || ch).join('');
const MENU_VIDEO = path.join(__dirname, '..', 'assets', 'menu-logo.mp4');

function jSec(title, cmds) {
    const lines = (cmds || []).filter(Boolean).map(c => `*┋ ⬡ ${toSmallCaps(c)}*`);
    if (!lines.length) return '';
    return '`『 ' + title + ' 』`\n╭───────────────────⊷\n' + lines.join('\n') + '\n╰───────────────────⊷';
}

async function menuCmd(sock, from, msg) {
    const sections = [
        jSec('MAIN', [
            'menu',
            'ping',
            'mard (random video)',
        ]),
        jSec('SCHEDULER', [
            'schedule <num> | <time> | <msg>',
            'schedules',
            'cancel <id>',
            'cancelall',
        ]),
        jSec('CHANNEL', [
            'channelstatus',
            'autopost on/off',
            'settimes 10:00,13:00',
            'postnow',
            'setchannel <jid>',
            'findchannel <link>',
        ]),
        jSec('AI CHATBOT', [
            'chatbot on/off/status',
            'gemini <sawal>',
        ]),
        jSec('DOWNLOAD', [
            'tiktok <link>',
            'insta <link>',
            'fb <link>',
            'pinterest <link>',
            'movie <naam>',
            'vv (view-once reply)',
        ]),
        jSec('STATUS', [
            'autostatus on/off',
            'statusreact <emoji>',
            'autoreact on/off',
        ]),
        jSec('MIRROR', [
            'setsource <link>',
            'mirror on/off',
        ]),
        jSec('PRIVACY', [
            'antidelete on/off',
            'onetick on/off',
        ]),
    ].filter(Boolean);

    const header =
`╭━━━〔 🤖 *BABA SAB JANTA HAI* 〕━━━┈⊷
┃ 👑 Owner: Muavia
┃ ⚡ Total Commands: 27
╰━━━━━━━━━━━━━━━━━━━┈⊷\n\n`;

    const caption = header + sections.join('\n\n') + '\n\n> *© PERSONAL BOT — MUAVIA*';

    // Menu ke saath logo video bhejo (agar video file maujood hai)
    if (fs.existsSync(MENU_VIDEO)) {
        await sock.sendMessage(from, {
            video: fs.readFileSync(MENU_VIDEO),
            caption: caption,
            gifPlayback: false
        }, { quoted: msg });
    } else {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
    }
}

async function pingCmd(sock, from, msg) {
    const t = Date.now();
    await sock.sendMessage(from, { text: `🏓 Pong! ${Date.now() - t}ms` }, { quoted: msg });
}

module.exports = { menuCmd, pingCmd };
