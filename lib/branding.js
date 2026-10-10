/**
 * GLOBAL BRANDING MIDDLEWARE — Mini Bot ke har outgoing message par branding.
 *
 * Approach: sock.sendMessage ko wrap kiya gaya hai, is liye har command,
 * chatbot reply, downloader, scheduler aur auto-message automatically
 * branded hota hai — har jagah manually add karne ki zaroorat nahi.
 *
 * Rules:
 * - Branding sirf ek baar add hoti hai (pehle se ho to dobara nahi)
 * - Sirf text aur caption brand hote hain; media/buttons/links as-it-is
 * - Caption ki WhatsApp limit (~1024 chars) ka khayal rakha gaya hai
 * - Incoming user messages ko chhua nahi jata (sirf outgoing wrap hai)
 */

const BRANDING_LINE = '— Powered by MR MUAVIA MINI BOT';
const BRAND_SUFFIX = '\n\n' + BRANDING_LINE;
const BIO_TEXT = 'I am using the best bot MR Mauvia Mini.';
const CAPTION_LIMIT = 1024;

function hasBranding(text) {
    return typeof text === 'string' && text.includes(BRANDING_LINE);
}

function brandText(text) {
    if (typeof text !== 'string' || !text) return text;
    if (hasBranding(text)) return text; // dobara add na ho
    return text + BRAND_SUFFIX;
}

function brandCaption(caption) {
    if (typeof caption !== 'string' || !caption) return caption;
    if (hasBranding(caption)) return caption;
    // Caption limit se zyada ho to original ko trim karke branding ki jagah banao
    const maxOrig = CAPTION_LIMIT - BRAND_SUFFIX.length;
    const orig = caption.length > maxOrig ? caption.slice(0, maxOrig) : caption;
    return orig + BRAND_SUFFIX;
}

/**
 * sock.sendMessage ko wrap karo — is ke baad har outgoing message
 * automatically branded jayega (text + caption).
 */
function wrapSocket(sock) {
    if (!sock || sock._brandingWrapped) return sock;
    const origSend = sock.sendMessage.bind(sock);
    sock.sendMessage = async (jid, content, options) => {
        try {
            if (content && typeof content === 'object') {
                if (content.text) content.text = brandText(content.text);
                if (content.caption) content.caption = brandCaption(content.caption);
            }
        } catch (_) { /* branding fail ho to bhi message jana chahiye */ }
        return origSend(jid, content, options);
    };
    sock._brandingWrapped = true;
    return sock;
}

/**
 * Startup par WhatsApp profile bio set karo (sirf zaroorat par).
 * Har message par update NAHI hota — sirf connect par check + set.
 */
async function ensureBio(sock) {
    try {
        const me = sock.user && sock.user.id;
        if (!me) return { ok: false, reason: 'sock.user nahi mila' };
        let current = '';
        try {
            const st = await sock.fetchStatus(me);
            current = (st && st.status) || '';
        } catch (_) { /* fetch fail ho to bhi set karne ki koshish karo */ }
        if (current === BIO_TEXT) return { ok: true, unchanged: true };
        await sock.updateProfileStatus(BIO_TEXT);
        return { ok: true, updated: true };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

module.exports = {
    BRANDING_LINE,
    BIO_TEXT,
    hasBranding,
    brandText,
    brandCaption,
    wrapSocket,
    ensureBio,
};
