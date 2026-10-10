/**
 * CREATIVE CONTENT — Gemini se shayari, quotes aur captions.
 *
 * .shayari [topic]  — Roman Urdu shayari (2-4 lines)
 *                     Example: .shayari mohabbat
 * .quote [topic]    — motivational/inspirational quote
 *                     Example: .quote success
 * .caption [topic]  — social media caption (Instagram/TikTok style)
 *                     Example: .caption dosti
 */
const { chatText } = require('../lib/geminiImage');

async function runCreative(sock, from, msg, kind, topic) {
    const prompts = {
        shayari: `Write a beautiful 2-4 line Roman Urdu shayari${topic ? ` on the topic "${topic}"` : ''}. Emotional, poetic, no explanation.`,
        quote: `Write one short powerful motivational quote${topic ? ` about "${topic}"` : ''}. Under 25 words. No explanation.`,
        caption: `Write a catchy social-media caption${topic ? ` about "${topic}"` : ''} with 2-3 relevant hashtags. Under 40 words. Roman Urdu or English mix is fine.`,
    };
    const titles = { shayari: '🖋️ *Shayari:*', quote: '💡 *Quote:*', caption: '📸 *Caption:*' };
    const systems = {
        shayari: 'You are an Urdu poet writing in Roman Urdu script.',
        quote: 'You are a motivational writer.',
        caption: 'You are a social media expert.',
    };
    try {
        const out = await chatText(prompts[kind], systems[kind]);
        await sock.sendMessage(from, { text: `${titles[kind]}\n\n${out}` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, {
            text: '❌ AI error: ' + e.message +
                '\n\n💡 Setup: .env mein GEMINI_API_KEY lagayein (free: https://aistudio.google.com/apikey).',
        }, { quoted: msg });
    }
}

async function shayariCmd(sock, from, msg, args) {
    await runCreative(sock, from, msg, 'shayari', (args || []).join(' ').trim());
}

async function quoteCmd(sock, from, msg, args) {
    await runCreative(sock, from, msg, 'quote', (args || []).join(' ').trim());
}

async function captionCmd(sock, from, msg, args) {
    await runCreative(sock, from, msg, 'caption', (args || []).join(' ').trim());
}

module.exports = { shayariCmd, quoteCmd, captionCmd };
