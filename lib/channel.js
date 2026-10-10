/**
 * Mini bot ka WhatsApp Channel (MUAVIA MINI BOT 🎭).
 * JID kabhi hardcode nahi — invite link se runtime par resolve hota hai.
 */
const CHANNEL_URL = process.env.CHANNEL_URL || 'https://whatsapp.com/channel/0029VbDUrr1AojYnZ7f3ny39';

let cached = null; // { jid, name }
let failedAt = 0;
const RESOLVE_COOLDOWN_MS = 5 * 60 * 1000;

function extractInviteCode(url) {
    if (!url) return null;
    const match = String(url).match(/whatsapp\.com\/channel\/([A-Za-z0-9]+)/i);
    return match ? match[1] : null;
}

async function resolveChannel(sock, url) {
    const targetUrl = url || CHANNEL_URL;
    const inviteCode = extractInviteCode(targetUrl);
    if (!inviteCode) return null;
    if (cached) return cached;
    if (failedAt && Date.now() - failedAt < RESOLVE_COOLDOWN_MS) return null;
    try {
        if (!sock || typeof sock.newsletterMetadata !== 'function') {
            failedAt = Date.now();
            return null;
        }
        const metadata = await sock.newsletterMetadata('invite', inviteCode);
        if (metadata && metadata.id) {
            cached = { jid: metadata.id, name: metadata.name || 'MUAVIA MINI BOT' };
            failedAt = 0;
            return cached;
        }
        failedAt = Date.now();
        return null;
    } catch (e) {
        console.error('[channel] resolve failed:', e.message);
        failedAt = Date.now();
        return null;
    }
}

/**
 * "View channel" badge — message ke saath bhejo taake WhatsApp par
 * channel ka button nazar aaye (production bot jaisa).
 */
async function getChannelContextInfo(sock) {
    const channel = await resolveChannel(sock);
    if (!channel) return {};
    return {
        contextInfo: {
            forwardingScore: 999,
            isForwarded: true,
            forwardedNewsletterMessageInfo: {
                newsletterJid: channel.jid,
                newsletterName: channel.name,
                serverMessageId: -1
            }
        }
    };
}

module.exports = { resolveChannel, getChannelContextInfo, CHANNEL_URL, extractInviteCode };
