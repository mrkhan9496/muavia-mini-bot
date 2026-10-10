/**
 * WhatsApp Channel auto-posting engine.
 * - Every 60s checks configured post times (HH:MM, bot timezone).
 * - Posts once per time-slot per day (tracked in settings).
 * - Each post: fresh AI prompt -> Gemini image -> channel with prompt caption.
 * - .postnow triggers an immediate post. Failures never crash the bot.
 */
const db = require('./db');
const promptGen = require('./promptGen');
const { generateImage } = require('./geminiImage');

const CHECK_MS = 60 * 1000;

function tzNow() {
    const tz = process.env.TIMEZONE || 'Asia/Karachi';
    return new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
}
function hhmm(d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}
function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function parseTimes(s) {
    return String(s || '').split(',').map(t => t.trim()).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t));
}

async function doPost(sock, manual) {
    const channelJid = (await db.getSetting('channel_jid')) || process.env.CHANNEL_JID || '';
    if (!channelJid) throw new Error('Channel not configured. Set CHANNEL_JID in .env or ask owner to configure.');

    const prompt = await promptGen.generate();
    let img;
    try { img = await generateImage(prompt); }
    catch (e) { throw new Error('Image generation failed: ' + e.message); }

    const caption = `Image Prompt:\n"${prompt}"`;
    try {
        await sock.sendMessage(channelJid, {
            image: img.buffer,
            mimetype: img.mime,
            caption,
        });
    } catch (e) {
        throw new Error('Channel send failed (is the bot a channel admin?): ' + e.message);
    }

    const n = parseInt(await db.getSetting('post_count') || '0', 10) + 1;
    await db.setSetting('post_count', String(n));
    await db.setSetting('last_post', new Date().toISOString());
    await db.setSetting('last_post_error', '');
    console.log('[channel] posted' + (manual ? ' (manual)' : '') + ' #' + n);
    return { prompt, n };
}

async function tick(sock) {
    try {
        if ((await db.getSetting('autopost')) !== 'on') return;
        const now = tzNow();
        // .cancelpost ne aaj ke posts cancel kiye hon to skip
        if (await db.getSetting('cancelled_' + ymd(now))) return;
        const times = parseTimes(await db.getSetting('post_times'));
        const slot = hhmm(now);
        if (!times.includes(slot)) return;
        const key = 'posted_' + ymd(now) + '_' + slot.replace(':', '');
        if (await db.getSetting(key)) return; // already posted this slot today
        await db.setSetting(key, '1');
        try { await doPost(sock, false); }
        catch (e) {
            await db.setSetting('last_post_error', String(e.message).slice(0, 300));
            console.error('[channel] auto-post failed:', e.message);
        }
    } catch (e) {
        console.error('[channel] tick error:', e.message);
    }
}

function nextPostInfo() {
    // best-effort: first configured time later today, else first time tomorrow
    return null; // computed in channelstatus command where db is handy
}

function start(sock) {
    console.log('[channel] auto-post engine started (60s checks)');
    setInterval(() => tick(sock), CHECK_MS);
}

module.exports = { start, tick, doPost, parseTimes, tzNow, hhmm, ymd };
