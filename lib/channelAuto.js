/**
 * Channel auto-follow + auto-react (production bot wala pattern).
 *
 * - Follow: connect par SIRF EK dafa (har reconnect par nahi — ban-safe).
 * - React: channel ki har nayi post par random emoji.
 */
const { resolveChannel } = require('./channel');

const REACT_EMOJIS = ['❤️', '🔥', '👍', '👏', '🎉', '😮', '💯', '🙏'];
// Multi-session: har session apne liye follow kare (global flag nahi!)
const followedSessions = new Set();

async function autoFollowChannel(sock, sessionId) {
    const key = sessionId || 'default';
    if (followedSessions.has(key)) return;
    try {
        const channel = await resolveChannel(sock);
        if (!channel || !channel.jid) return;
        if (typeof sock.newsletterFollow !== 'function') return;
        await sock.newsletterFollow(channel.jid);
        followedSessions.add(key);
        console.log(`[channel] Auto-followed: ${channel.name} ✅`);
    } catch (e) {
        // Pehle se following / temporary fail — bot nahi rukega
        console.log('[channel] Auto-follow skip:', e.message);
    }
}

async function maybeReactToChannelPost(sock, msg) {
    try {
        const from = (msg.key && msg.key.remoteJid) || '';
        if (!from.endsWith('@newsletter')) return false;
        const channel = await resolveChannel(sock);
        if (!channel || channel.jid !== from) return false;
        const content = msg.message;
        if (!content) return false;
        const type = Object.keys(content)[0];
        if (!type || type === 'reactionMessage' || type === 'protocolMessage') return false;
        if (typeof sock.newsletterReactMessage !== 'function') return false;
        const emoji = REACT_EMOJIS[0]; // FIXED: pehla emoji hi (random nahi)
        await sock.newsletterReactMessage(channel.jid, msg.key.id, emoji);
        console.log(`[channel] Reacted ${emoji} to channel post`);
        return true;
    } catch (e) {
        return false;
    }
}

module.exports = { autoFollowChannel, maybeReactToChannelPost };
