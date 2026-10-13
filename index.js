/**
 * MR MUAVIA SCHEDULER BOT (personal)
 * Features: personal message scheduler, WhatsApp channel auto-posting
 * (Gemini AI images), AI chatbot on/off. Persistent via Postgres/file.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');

const db = require('./lib/db');
const branding = require('./lib/branding');
const scheduler = require('./lib/scheduler');
const channelPost = require('./lib/channelPost');
const aiChat = require('./lib/aiChat');

const scheduleCmds = require('./commands/schedule');
const channelCmds = require('./commands/channel');
const chatbotCmds = require('./commands/chatbot');
const geminiCmds = require('./commands/gemini');
const menuCmds = require('./commands/menu');
const mardCmds = require('./commands/mard');
const sadCmds = require('./commands/sad');
const baapCmds = require('./commands/baap');
const dailyLifeCmds = require('./commands/dailylife');
const seriesCmds = require('./commands/series');
const aiCmds = require('./commands/ai');
const creativeCmds = require('./commands/creative');
const personalCmds = require('./commands/personal');
const monitorCmds = require('./commands/monitor');
const qrCmds = require('./commands/qr');
const pollCmds = require('./commands/poll');
const feedbackCmds = require('./commands/feedback');
const autogreetCmds = require('./commands/autogreet');
const stickerCmds = require('./commands/sticker');
const moderationCmds = require('./commands/moderation');
const movieCmds = require('./commands/movie');
const vvCmds = require('./commands/vv');
const antideleteCmds = require('./commands/antidelete');
const antiviewonceCmds = require('./commands/antiviewonce');
const alwaysonlineCmds = require('./commands/alwaysonline');
const gsCmds = require('./commands/gs');
const wordreactCmds = require('./commands/wordreact');
const autostatusCmds = require('./commands/autostatus');
const autoreactCmds = require('./commands/autoreact');
const mirrorCmds = require('./commands/mirror');
const channelAuto = require('./lib/channelAuto');
const statusreactCmds = require('./commands/statusreact');
const onetickCmds = require('./commands/onetick');
const downloadersCmds = require('./commands/downloaders');

const sessions = require('./lib/sessions');

const OWNER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');
const AUTH_DIR = path.join(process.cwd(), 'auth_info');

function isOwner(jid) {
    const num = jidNormalizedUser(jid).split('@')[0].replace(/[^0-9]/g, '');
    return OWNER && (num === OWNER || num.endsWith(OWNER.slice(-10)));
}

// Multi-session: har session ka apna sock. handleCommand ko sock parameter milta hai.
async function handleCommand(sock, cmd, args, from, msg, isAdmin) {
    switch (cmd) {
        case 'menu': case 'help': return menuCmds.menuCmd(sock, from, msg);
        case 'ping': return menuCmds.pingCmd(sock, from, msg);
        case 'runtime': return menuCmds.runtimeCmd(sock, from, msg);
        case 'mard': return mardCmds.mardCmd(sock, from, msg);
        case 'sad': return sadCmds.sadCmd(sock, from, msg);
        case 'baap': return baapCmds.baapCmd(sock, from, msg);
        // Daily Life Reply commands
        case 'salam': case 'wsalam': case 'subah': case 'shab':
        case 'sorry': case 'maafi':
        case 'shukriya': case 'thanks':
        case 'ijazat':
        case 'respect': case 'adab':
        case 'dua': case 'khairiyat': case 'mashallah':
        case 'haal': case 'busy': case 'ok':
        case 'dost': case 'mohabbat':
        case 'takecare': case 'bye': case 'allahhafiz':
            return dailyLifeCmds.dailyLifeCmd(sock, from, msg, cmd, args);
        case 'schedule': return scheduleCmds.scheduleCmd(sock, from, msg, args, isAdmin);
        case 'schedules': return scheduleCmds.schedulesCmd(sock, from, msg, isAdmin);
        case 'cancel': return scheduleCmds.cancelCmd(sock, from, msg, args, isAdmin);
        case 'cancelall': return scheduleCmds.cancelAllCmd(sock, from, msg, isAdmin);
        case 'channelstatus': return channelCmds.channelStatusCmd(sock, from, msg);
        case 'autopost': return channelCmds.autopostCmd(sock, from, msg, args);
        case 'settimes': return channelCmds.settimesCmd(sock, from, msg, args);
        case 'postnow': return channelCmds.postnowCmd(sock, from, msg);
        case 'setchannel': return channelCmds.setchannelCmd(sock, from, msg, args);
        case 'findchannel': return channelCmds.findchannelCmd(sock, from, msg, args);
        case 'chatbot': return chatbotCmds.chatbotCmd(sock, from, msg, args);
        case 'gemini': return geminiCmds.geminiCmd(sock, from, msg, args);
        case 'movie': case 'movies': return movieCmds.movieCmd(sock, from, msg, args);
        case 'moviedl': return movieCmds.moviedlCmd(sock, from, msg, args);
        case 'series': return seriesCmds.seriesCmd(sock, from, msg, args);
        case 'seriesdl': return seriesCmds.seriesdlCmd(sock, from, msg, args);
        // AI Assistant
        case 'ai': case 'ask': return aiCmds.aiCmd(sock, from, msg, args);
        case 'translate': return aiCmds.translateCmd(sock, from, msg, args);
        case 'summarize': return aiCmds.summarizeCmd(sock, from, msg, args);
        // Creative
        case 'shayari': return creativeCmds.shayariCmd(sock, from, msg, args);
        case 'quote': return creativeCmds.quoteCmd(sock, from, msg, args);
        case 'caption': return creativeCmds.captionCmd(sock, from, msg, args);
        // Personal utilities
        case 'remind': return personalCmds.remindCmd(sock, from, msg, args);
        case 'reminders': return personalCmds.remindersCmd(sock, from, msg);
        case 'unremind': return personalCmds.unremindCmd(sock, from, msg, args);
        case 'todo': return personalCmds.todoCmd(sock, from, msg, args);
        case 'note': return personalCmds.noteCmd(sock, from, msg, args);
        case 'notes': return personalCmds.notesCmd(sock, from, msg);
        case 'notedel': return personalCmds.notedelCmd(sock, from, msg, args);
        // Monitoring
        case 'uptime': return monitorCmds.uptimeCmd(sock, from, msg);
        case 'apihealth': return monitorCmds.apihealthCmd(sock, from, msg);
        // QR + Poll
        case 'qr': return qrCmds.qrCmd(sock, from, msg, args);
        case 'poll': return pollCmds.pollCmd(sock, from, msg, args);
        // Feedback + Autogreet
        case 'feedback': return feedbackCmds.feedbackCmd(sock, from, msg, args);
        case 'autogreet': return autogreetCmds.autogreetCmd(sock, from, msg, args, admin);
        // Stickers
        case 'sticker': return stickerCmds.stickerCmd(sock, from, msg);
        case 'toimg': return stickerCmds.toimgCmd(sock, from, msg);
        // Group moderation
        case 'antilink': return moderationCmds.antilinkCmd(sock, from, msg, args, admin);
        case 'antispam': return moderationCmds.antispamCmd(sock, from, msg, args, admin);
        case 'warn': return moderationCmds.warnCmd(sock, from, msg, args, admin);
        case 'unwarn': return moderationCmds.unwarnCmd(sock, from, msg, args, admin);
        case 'mute': return moderationCmds.muteCmd(sock, from, msg, args, admin, false);
        case 'unmute': return moderationCmds.muteCmd(sock, from, msg, args, admin, true);
        case 'rules': return moderationCmds.rulesCmd(sock, from, msg, args, admin);
        // Channel
        case 'cancelpost': return channelCmds.cancelpostCmd(sock, from, msg);
        case 'vv': return vvCmds.vvCmd(sock, from, msg, args, admin);
        case 'antidelete': return antideleteCmds.antideleteCmd(sock, from, msg, args, admin);
        case 'antiviewonce': return antiviewonceCmds.antiviewonceCmd(sock, from, msg, args, admin);
        case 'alwaysonline': return alwaysonlineCmds.alwaysonlineCmd(sock, from, msg, args, admin);
        case 'gs': case 'groupstatus': return gsCmds.gsCmd(sock, from, msg, args, admin);
        case 'wordreact': return wordreactCmds.wordreactCmd(sock, from, msg, args, admin);
        case 'autostatus': case 'status': return autostatusCmds.autostatusCmd(sock, from, msg, args);
        case 'autoreact': return autoreactCmds.autoreactCmd(sock, from, msg, args, isAdmin);
        case 'setsource': return mirrorCmds.setsourceCmd(sock, from, msg, args);
        case 'mirror': return mirrorCmds.mirrorCmd(sock, from, msg, args);
        case 'statusreact': return statusreactCmds.statusreactCmd(sock, from, msg, args);
        case 'onetick': case 'ghost': case 'singletick':
            return onetickCmds.onetickCmd(sock, from, msg, args, isAdmin);
        case 'tiktok': case 'tt': return downloadersCmds.tiktokCmd(sock, from, msg, args);
        case 'insta': case 'ig': return downloadersCmds.instaCmd(sock, from, msg, args);
        case 'fb': case 'facebook': return downloadersCmds.fbCmd(sock, from, msg, args);
        case 'pinterest': case 'pin': return downloadersCmds.pinterestCmd(sock, from, msg, args);
        default: return null; // unknown
    }
}

// Multi-session: har session ka apna onMessage handler (apne sock ke saath)
function makeOnMessage(sock) {
    return async function onMessage(m) {
    try {
        const msg = m.messages?.[0];
        if (!msg?.message) return;
        const from = msg.key.remoteJid;
        const isMe = msg.key.fromMe;
        // PERSONAL BOT FIX: owner apne phone se commands chalata hai, is liye
        // isMe par commands ALLOW hain. Sirf auto-features (autoreact/chatbot)
        // skip hote hain taake infinite loop na bane.
        // Channel auto-react: apne channel ki post par random emoji (production jaisa)
        try {
            if (await channelAuto.maybeReactToChannelPost(sock, msg)) return;
        } catch {}
        // Channel mirror: source channel ki nayi post → apne channel par repost
        await mirrorCmds.handleMirrorMessage(sock, msg).catch(() => {});
        // Status updates: handle auto-status (view + react) before returning
        if (from === 'status@broadcast') {
            await autostatusCmds.handleStatusUpdate(sock, m).catch(() => {});
            return;
        }
        // Auto-react: har incoming message par emoji react (jab ON ho) — apne messages par nahi
        if (!isMe) autoreactCmds.handleAutoReact(sock, msg).catch(() => {});
        if (!isMe) wordreactCmds.handleWordReact(sock, msg).catch(() => {});
        // Antidelete: store every incoming message; handle revocations
        try {
            if (msg.message?.protocolMessage?.type === 0) {
                await antideleteCmds.handleMessageRevocation(sock, msg).catch(() => {});
                return;
            }
            antideleteCmds.storeMessage(sock, msg).catch(() => {});
        } catch {}
        // Anti-viewonce: auto-capture view-once image/video/voice → owner DM
        try {
            await antiviewonceCmds.handleViewOnce(sock, msg).catch(() => {});
        } catch {}
        // Group moderation: antilink/antispam/mute check (command se pehle) — apne messages skip
        try {
            if (!isMe) {
                const deleted = await moderationCmds.handleModeration(sock, msg, from);
                if (deleted) return;
            }
        } catch (_) {}

        const text = msg.message.conversation
            || msg.message.extendedTextMessage?.text
            || msg.message.imageMessage?.caption
            || '';
        if (!text) return;

        // isMe = paired phone ka owner khud → hamesha admin (personal bot)
        const admin = isMe || isOwner(from) || isOwner(msg.key.participant || '');
        const prefix = '.';

        if (text.startsWith(prefix)) {
            const [raw, ...args] = text.slice(1).trim().split(/\s+/);
            const cmd = raw.toLowerCase();
            // admin-only commands
            const adminOnly = ['schedule', 'schedules', 'cancel', 'cancelall', 'autopost', 'settimes', 'postnow', 'setchannel', 'findchannel', 'chatbot', 'cancelpost',
                // Daily Life Reply commands (owner ke personal replies)
                'salam', 'wsalam', 'subah', 'shab', 'sorry', 'maafi', 'shukriya', 'thanks',
                'ijazat', 'respect', 'adab', 'dua', 'khairiyat', 'mashallah',
                'haal', 'busy', 'ok', 'dost', 'mohabbat', 'takecare', 'bye', 'allahhafiz'];
            if (adminOnly.includes(cmd) && !admin) {
                await sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });
                return;
            }
            const handled = await handleCommand(sock, cmd, args, from, msg, admin);
            if (handled === null && admin) {
                await sock.sendMessage(from, { text: '❌ Unknown command. Send .menu' }, { quoted: msg });
            }
            return; // commands never trigger chatbot
        }

        // AI chatbot (global on/off, persistent) — apne messages par nahi (loop protection)
        if (!isMe && (await db.getSetting('chatbot')) === 'on') {
            if (!chatbotCmds.canReply(from)) return; // rate limit
            try {
                const reply = await aiChat.reply(text.slice(0, 500));
                await sock.sendMessage(from, { text: reply }, { quoted: msg });
            } catch (e) {
                console.error('[chatbot] reply failed:', e.message);
            }
        }
    } catch (e) {
        console.error('[onMessage]', e.message);
    }
    }; // end onMessage
} // end makeOnMessage

// Ban protection: exponential backoff + session parking (production bot wala proven pattern)
const MAX_FAILURES = 5;

/**
 * Pairing page se call hota hai: parked/dead session ko unpark karke
 * fresh socket start karo taake pairing code/QR kaam kare.
 */
async function requestSocketRestart(sessionId) {
    const session = sessions.get(sessionId);
    if (!session) return;
    session.parked = false;
    session.consecutiveFailures = 0;
    console.log(`[pair] Socket restart requested for ${sessionId} — unparking session.`);
    // Purana socket band karo (agar khula hai)
    try { session.sock?.ws?.close(); } catch {}
    await startSession(sessionId);
}

async function startSession(sessionId) {
    const session = sessions.create(sessionId);
    await db.init();
    if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
    // DATABASE_URL ho to session DB mein (redeploy-proof), warna files
    // Har session ka alag user_id: mini-bot-<sessionId>
    const { getAuthState } = require('./lib/dbAuthState');
    const { state, saveCreds } = await getAuthState(`mini-bot-${sessionId}`, AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: false,
        browser: ['SchedulerBot', 'Chrome', '1.0'],
    });
    sessions.setSock(sessionId, sock);
    sock.ev.on('creds.update', saveCreds);
    branding.wrapSocket(sock); // GLOBAL BRANDING: har outgoing message auto-branded

    sock.ev.on('connection.update', (u) => {
        const { connection, lastDisconnect, qr } = u;
        if (connection) sessions.setConnState(sessionId, connection);
        if (qr) {
            console.log(`[${sessionId}] Scan QR to pair:`);
            qrcode.generate(qr, { small: true });
            sessions.setQR(sessionId, qr);
        }
        if (connection === 'open') {
            session.consecutiveFailures = 0; // kamyab connect par counter reset
            sessions.setQR(sessionId, null); // pair ho gaya — QR ki zaroorat nahi
            const myJid = jidNormalizedUser(sock.user.id);
            sessions.setPaired(sessionId, true, myJid);
            console.log(`[${sessionId}] ✅ Connected as`, myJid);
            // Welcome message — nayi pairing par khud ko bhejo (sirf ek dafa per session)
            // Image + caption ek hi message mein (menu jaisa style)
            (async () => {
                try {
                    const welcomeKey = `welcome_sent_for_${sessionId}`;
                    const lastWelcome = await db.getSetting(welcomeKey);
                    if (lastWelcome !== myJid) {
                        const welcomeCaption =
                            `🎉 *BABA SAB JANTA HAI* mein khush amdeed!\n\n` +
                            `✅ Bot connect ho gaya hai!\n\n` +
                            `*Khaas features:*\n` +
                            `👁️ Auto view-once save\n` +
                            `🗑️ Anti-delete\n` +
                            `🟢 Always online\n` +
                            `💋 Word react (bina dot ke!)\n` +
                            `📝 .gs — Group Status\n\n` +
                            `*Shuru karo:* .menu likho`;
                        try {
                            const logoPath = path.join(__dirname, 'assets', 'menu-logo.jpg');
                            const imgBuf = fs.readFileSync(logoPath);
                            await sock.sendMessage(myJid, { image: imgBuf, caption: welcomeCaption });
                        } catch (imgErr) {
                            // Image na mile to sirf text bhejo
                            await sock.sendMessage(myJid, { text: welcomeCaption });
                        }
                        await db.setSetting(welcomeKey, myJid);
                        console.log(`[welcome] Welcome message (image+caption) bheja gaya ✅`);
                    }
                } catch (e) {
                    console.error('[welcome] Failed:', e.message);
                }
            })();
            // Apne channel ko auto-follow (sirf ek dafa per process — ban-safe)
            channelAuto.autoFollowChannel(sock).catch(() => {});
            // WhatsApp profile bio set karo (sirf zaroorat par, har message par nahi)
            branding.ensureBio(sock).then(r => {
                if (r.ok && r.updated) console.log('📝 Bio set ho gayi.');
                else if (r.ok) console.log('📝 Bio pehle se set hai.');
                else console.log('📝 Bio set nahi ho saki:', r.reason);
            }).catch(() => {});
            // Re-apply ghost mode if it was enabled (persists across restarts)
            onetickCmds.isGhostEnabled().then(en => { if (en) onetickCmds.applyGhostMode(sock, true); }).catch(() => {});
            // Re-follow mirror source channel (taake uski posts milti rahein)
            mirrorCmds.getSourceJid().then(jid => {
                if (jid) sock.newsletterFollow(jid).catch(() => {});
            }).catch(() => {});
            scheduler.start(sock);
            channelPost.start(sock);
            // Always-online: hamesha "online" show (default ON)
            alwaysonlineCmds.startPresenceLoop(sock);
            // Pending reminders dobara arm karo (restart-safe)
            personalCmds.initReminders(sock).catch(() => {});
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            console.log(`[${sessionId}] Connection closed:`, code);
            sessions.setPaired(sessionId, false);
            // 401 (loggedOut) ya 403 (banned/forbidden) par foran park — retry = ban harden
            if (code === DisconnectReason.loggedOut || code === 403 || code === DisconnectReason.forbidden) {
                session.parked = true;
                console.log(`[${sessionId}] 🛑 Session parked (auth refused/banned). Auto-retry BAND. Dobara pair karo.`);
                return;
            }
            if (session.parked) {
                console.log(`[${sessionId}] 🛑 Session parked hai — auto-retry nahi hoga.`);
                return;
            }
            // Exponential backoff: 5s -> 10s -> 20s -> 40s -> 60s (cap)
            // 5 consecutive failures par park
            if (session.consecutiveFailures >= MAX_FAILURES) {
                session.parked = true;
                console.log(`[${sessionId}] 🛑 5 lagatar failures — session parked (number bachane ke liye). Dobara pair karo.`);
                return;
            }
            const delayMs = Math.min(5000 * Math.pow(2, session.consecutiveFailures), 60000);
            session.consecutiveFailures++;
            console.log(`[${sessionId}] Reconnecting in ${Math.round(delayMs / 1000)}s (failure ${session.consecutiveFailures}/${MAX_FAILURES})...`);
            setTimeout(() => startSession(sessionId), delayMs);
        }
    });

    sock.ev.on('messages.upsert', makeOnMessage(sock));

    // Naye group members → autogreet
    sock.ev.on('group-participants.update', async (u) => {
        try {
            if (u.action === 'add' && u.participants && u.participants.length) {
                await autogreetCmds.handleMemberAdd(sock, u.id, u.participants);
            }
        } catch (_) {}
    });
}

process.on('uncaughtException', e => console.error('[fatal]', e.message));
process.on('unhandledRejection', e => console.error('[unhandled]', e?.message || e));

// Pairing web page (Railway PORT par) — multi-session: har banda apna QR/pairing code
const { startPairServer } = require('./lib/pairserver');
global.startMiniSession = startSession; // pairserver se naya session start karne ke liye
startPairServer(sessions, requestSocketRestart);

// Boot: DB se purane sessions load karke start karo + default session
(async () => {
    await db.init();
    const existingIds = await sessions.loadFromDB();
    // Purana single-session format ('mini-bot') ko migrate karo
    try {
        const url = process.env.DATABASE_URL;
        if (url) {
            const { Pool } = require('pg');
            const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 1 });
            const r = await pool.query("SELECT 1 FROM wa_sessions WHERE user_id = 'mini-bot'");
            if (r.rows.length && !existingIds.includes('default')) {
                await pool.query("UPDATE wa_sessions SET user_id = 'mini-bot-default' WHERE user_id = 'mini-bot'");
                console.log('[boot] Migrated mini-bot → mini-bot-default');
                existingIds.push('default');
            }
            await pool.end();
        }
    } catch (e) {
        console.error('[boot] Migration failed:', e.message);
    }
    if (!existingIds.length) existingIds.push('default');
    for (const sid of existingIds) {
        startSession(sid).catch(e => console.error(`[boot] Session ${sid} failed:`, e.message));
    }
})();
