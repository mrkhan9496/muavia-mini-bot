/**
 * AI ASSISTANT commands — Gemini powered (lib/aiChat: Gemini first, OpenAI fallback).
 *
 * .ai <sawal>              — AI se poocho (alias: .ask)
 * .ask <sawal>             — .ai ka alias
 * .translate <lang> <text> — tarjuma (lang: en, ur, ar, hi ...)
 *                            Example: .translate en Assalam o Alaikum
 * .summarize <text>        — lambi text ka khulasa (ya reply karke .summarize)
 */
const aiChat = require('../lib/aiChat');
const { chatText } = require('../lib/geminiImage');

async function aiCmd(sock, from, msg, args) {
    const q = (args || []).join(' ').trim();
    if (!q) {
        return sock.sendMessage(from, {
            text: '❌ Sawal likho:\n.ai Pakistan ka capital kya hai?\n.ask Quran ki pehli surah kaun si hai?',
        }, { quoted: msg });
    }
    try {
        const reply = await aiChat.reply(q.slice(0, 1000));
        await sock.sendMessage(from, { text: `🤖 *AI:*\n\n${reply}` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, {
            text: '❌ AI unavailable: ' + e.message +
                '\n\n💡 Setup: .env mein GEMINI_API_KEY lagayein (https://aistudio.google.com/apikey — free).',
        }, { quoted: msg });
    }
}

async function translateCmd(sock, from, msg, args) {
    const lang = (args[0] || '').trim();
    const text = (args || []).slice(1).join(' ').trim();
    if (!lang || !text) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.translate en Assalam o Alaikum\n.translate ur Good morning\n\nSupported: en, ur, ar, hi, fr, de, es ...',
        }, { quoted: msg });
    }
    try {
        const out = await chatText(
            `Translate the following text to language code "${lang}". Reply with ONLY the translation, no explanation:\n\n${text.slice(0, 800)}`,
            'You are a precise translator. Output only the translated text.'
        );
        await sock.sendMessage(from, { text: `🌐 *Translate (${lang}):*\n\n${out}` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Translate error: ' + e.message }, { quoted: msg });
    }
}

async function summarizeCmd(sock, from, msg, args) {
    // Pehle args, warna quoted message ka text
    let text = (args || []).join(' ').trim();
    if (!text) {
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        text = quoted?.conversation || quoted?.extendedTextMessage?.text || '';
    }
    if (!text) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.summarize <lamba text>\nYa kisi message ko reply karke .summarize likhein.',
        }, { quoted: msg });
    }
    try {
        const out = await chatText(
            `Summarize the following text in 3-5 short bullet points, same language as the text:\n\n${text.slice(0, 2000)}`,
            'You are a concise summarizer.'
        );
        await sock.sendMessage(from, { text: `📝 *Khulasa:*\n\n${out}` }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Summarize error: ' + e.message }, { quoted: msg });
    }
}

module.exports = { aiCmd, translateCmd, summarizeCmd };
