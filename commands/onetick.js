/**
 * .onetick on/off — Ghost Mode (1-Tick)
 * When ON: sender sees only 1 grey tick, but you can read messages.
 * Aliases: .ghost, .singletick
 */
const db = require('../lib/db');

// Apply ghost mode to a live socket: swallow outgoing receipts
function applyGhostMode(sock, enabled) {
    if (!sock) return;
    try {
        if (enabled) {
            if (!sock._origSendReceipt) sock._origSendReceipt = sock.sendReceipt.bind(sock);
            if (!sock._origReadMessages) sock._origReadMessages = sock.readMessages.bind(sock);
            sock.sendReceipt = async () => {};
            sock.readMessages = async () => {};
            try { sock.sendPresenceUpdate('unavailable'); } catch {}
        } else {
            if (sock._origSendReceipt) sock.sendReceipt = sock._origSendReceipt;
            if (sock._origReadMessages) sock.readMessages = sock._origReadMessages;
            try { sock.sendPresenceUpdate('available'); } catch {}
        }
    } catch {}
}

async function isGhostEnabled() {
    const v = await db.getSetting('ghost_mode');
    return v === 'on';
}

async function onetickCmd(sock, from, msg, args, isAdmin) {
    // Owner only — mini bot is single-user, check isAdmin (owner)
    if (!isAdmin) {
        await sock.sendMessage(from, { text: '❌ Ye command sirf owner ke liye hai!' }, { quoted: msg });
        return;
    }

    let enabled = await isGhostEnabled();
    if (args.length > 0) {
        const a = args[0].toLowerCase();
        if (a === 'on' || a === 'enable') enabled = true;
        else if (a === 'off' || a === 'disable') enabled = false;
        else {
            await sock.sendMessage(from, { text: '❌ Ghalat option! Use: .onetick on/off' }, { quoted: msg });
            return;
        }
    } else {
        enabled = !enabled;
    }

    await db.setSetting('ghost_mode', enabled ? 'on' : 'off');
    applyGhostMode(sock, enabled);

    await sock.sendMessage(from, {
        text: enabled
            ? '👻 *Ghost Mode ON!*\n\nAb jo bhi message karega usko sirf *1 grey tick* nazar aayega.\nTum message parh lo ge to bhi usko pata nahi chale ga — lage ga tum offline ho.'
            : '👻 *Ghost Mode OFF!*\n\nAb normal ticks kaam karenge (delivered + read).'
    }, { quoted: msg });
}

module.exports = { onetickCmd, isGhostEnabled, applyGhostMode };
