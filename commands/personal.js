/**
 * PERSONAL UTILITIES — owner ke kaam ke tools.
 *
 * .remind <time> <text>  — yaad dilaao (restart-safe)
 *                          Example: .remind 10m pani piyo
 *                                   .remind 2h meeting hai
 *                                   .remind 1d birthday
 *                          Units: s (second), m (minute), h (hour), d (day)
 * .reminders             — pending reminders dekho
 * .unremind <id>         — reminder cancel karo
 *
 * .todo add <task>       — task add karo
 * .todo list             — tasks dekho
 * .todo done <n>         — task complete
 * .todo clear            — sab clear
 *
 * .note <text>           — note save karo
 * .notes                 — notes dekho
 * .notedel <n>           — note delete karo
 */
const db = require('../lib/db');

const timers = new Map(); // id -> timeout

function parseDuration(str) {
    const m = String(str || '').trim().toLowerCase().match(/^(\d+)(s|m|h|d)$/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    const mult = { s: 1000, m: 60 * 1000, h: 3600 * 1000, d: 24 * 3600 * 1000 };
    const ms = n * mult[m[2]];
    if (ms < 5000 || ms > 30 * 24 * 3600 * 1000) return null; // 5s se 30 din
    return ms;
}

async function getReminders() {
    return (await db.getSetting('reminders')) || [];
}
async function saveReminders(list) {
    await db.setSetting('reminders', list);
}

function armReminder(sock, r) {
    if (timers.has(r.id)) clearTimeout(timers.get(r.id));
    const delay = new Date(r.fireAt).getTime() - Date.now();
    if (delay <= 0) {
        fireReminder(sock, r).catch(() => {});
        return;
    }
    // setTimeout ki max limit (~24 din) se zyada ho to cap karo
    const safeDelay = Math.min(delay, 2147483647);
    timers.set(r.id, setTimeout(() => fireReminder(sock, r).catch(() => {}), safeDelay));
}

async function fireReminder(sock, r) {
    timers.delete(r.id);
    try {
        await sock.sendMessage(r.chatJid, { text: `⏰ *Reminder:*\n\n${r.text}` });
    } catch (_) {}
    const list = (await getReminders()).filter(x => x.id !== r.id);
    await saveReminders(list);
}

/** Startup par pending reminders dobara arm karo. index.js ke open handler se call hota hai. */
async function initReminders(sock) {
    try {
        const list = await getReminders();
        const now = Date.now();
        for (const r of list) {
            if (new Date(r.fireAt).getTime() <= now) {
                await fireReminder(sock, r);
            } else {
                armReminder(sock, r);
            }
        }
        if (list.length) console.log(`[remind] ${list.length} reminders re-armed`);
    } catch (e) {
        console.error('[remind] init failed:', e.message);
    }
}

async function remindCmd(sock, from, msg, args) {
    const durStr = (args[0] || '').trim();
    const text = (args || []).slice(1).join(' ').trim();
    const ms = parseDuration(durStr);
    if (!ms || !text) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.remind 10m pani piyo\n.remind 2h meeting hai\n.remind 1d birthday\n\nUnits: s=second, m=minute, h=hour, d=day (5s se 30 din)',
        }, { quoted: msg });
    }
    const r = {
        id: 'rm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        chatJid: from,
        text: text.slice(0, 500),
        fireAt: new Date(Date.now() + ms).toISOString(),
    };
    const list = await getReminders();
    list.push(r);
    await saveReminders(list);
    armReminder(sock, r);
    const when = new Date(r.fireAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });
    await sock.sendMessage(from, {
        text: `✅ Reminder set!\n🆔 ${r.id}\n🕐 ${when}\n💬 ${r.text}`,
    }, { quoted: msg });
}

async function remindersCmd(sock, from, msg) {
    const list = await getReminders();
    if (!list.length) return sock.sendMessage(from, { text: '📭 Koi pending reminder nahi.' }, { quoted: msg });
    const lines = list.map(r =>
        `🆔 ${r.id}\n🕐 ${new Date(r.fireAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}\n💬 ${r.text}`);
    await sock.sendMessage(from, { text: `⏰ *Reminders (${list.length}):*\n\n${lines.join('\n\n')}` }, { quoted: msg });
}

async function unremindCmd(sock, from, msg, args) {
    const id = (args[0] || '').trim();
    if (!id) return sock.sendMessage(from, { text: '❌ Usage: .unremind <id>' }, { quoted: msg });
    const list = await getReminders();
    const found = list.find(r => r.id === id || r.id.startsWith(id));
    if (!found) return sock.sendMessage(from, { text: '❌ Reminder nahi mila.' }, { quoted: msg });
    if (timers.has(found.id)) { clearTimeout(timers.get(found.id)); timers.delete(found.id); }
    await saveReminders(list.filter(r => r.id !== found.id));
    await sock.sendMessage(from, { text: `✅ Reminder cancel: ${found.id}` }, { quoted: msg });
}

// ---- TODO ----
async function getTodos() { return (await db.getSetting('todos')) || []; }

async function todoCmd(sock, from, msg, args) {
    const sub = ((args[0] || '').toLowerCase());
    const rest = (args || []).slice(1).join(' ').trim();
    const list = await getTodos();

    if (sub === 'add') {
        if (!rest) return sock.sendMessage(from, { text: '❌ Usage: .todo add <task>' }, { quoted: msg });
        list.push({ text: rest.slice(0, 300), done: false, at: new Date().toISOString() });
        await db.setSetting('todos', list);
        return sock.sendMessage(from, { text: `✅ Task add ho gaya (#${list.length}): ${rest.slice(0, 100)}` }, { quoted: msg });
    }
    if (sub === 'list') {
        if (!list.length) return sock.sendMessage(from, { text: '📭 Todo list khaali hai.' }, { quoted: msg });
        const lines = list.map((t, i) => `${t.done ? '✅' : '⬜'} ${i + 1}. ${t.text}`);
        return sock.sendMessage(from, { text: `📝 *Todo (${list.length}):*\n\n${lines.join('\n')}` }, { quoted: msg });
    }
    if (sub === 'done') {
        const n = parseInt(rest, 10);
        if (!n || n < 1 || n > list.length) return sock.sendMessage(from, { text: '❌ Usage: .todo done <number>' }, { quoted: msg });
        list[n - 1].done = true;
        await db.setSetting('todos', list);
        return sock.sendMessage(from, { text: `✅ Done: ${list[n - 1].text.slice(0, 100)}` }, { quoted: msg });
    }
    if (sub === 'clear') {
        await db.setSetting('todos', []);
        return sock.sendMessage(from, { text: '🗑️ Todo list clear ho gayi.' }, { quoted: msg });
    }
    return sock.sendMessage(from, {
        text: '❌ Usage:\n.todo add <task>\n.todo list\n.todo done <number>\n.todo clear',
    }, { quoted: msg });
}

// ---- NOTES ----
async function getNotes() { return (await db.getSetting('notes')) || []; }

async function noteCmd(sock, from, msg, args) {
    const text = (args || []).join(' ').trim();
    if (!text) return sock.sendMessage(from, { text: '❌ Usage: .note <text>' }, { quoted: msg });
    const list = await getNotes();
    list.push({ text: text.slice(0, 500), at: new Date().toISOString() });
    await db.setSetting('notes', list);
    await sock.sendMessage(from, { text: `📝 Note save ho gaya (#${list.length}).` }, { quoted: msg });
}

async function notesCmd(sock, from, msg) {
    const list = await getNotes();
    if (!list.length) return sock.sendMessage(from, { text: '📭 Koi note nahi.' }, { quoted: msg });
    const lines = list.slice(-15).map((n, i) => `${i + 1}. ${n.text}`);
    await sock.sendMessage(from, { text: `📝 *Notes (${list.length}):*\n\n${lines.join('\n')}` }, { quoted: msg });
}

async function notedelCmd(sock, from, msg, args) {
    const n = parseInt((args[0] || ''), 10);
    const list = await getNotes();
    if (!n || n < 1 || n > list.length) return sock.sendMessage(from, { text: '❌ Usage: .notedel <number>' }, { quoted: msg });
    list.splice(n - 1, 1);
    await db.setSetting('notes', list);
    await sock.sendMessage(from, { text: `🗑️ Note #${n} delete ho gaya.` }, { quoted: msg });
}

module.exports = {
    remindCmd, remindersCmd, unremindCmd, initReminders,
    todoCmd, noteCmd, notesCmd, notedelCmd,
};
