/**
 * .poll — WhatsApp native poll banao (group mein best).
 *
 * Usage: .poll Sawal? | Option 1 | Option 2 | Option 3
 * Example: .poll Chai ya Coffee? | Chai ☕ | Coffee ☕
 *
 * Max 12 options. "|" se separate karo.
 */
async function pollCmd(sock, from, msg, args) {
    const raw = (args || []).join(' ').trim();
    const parts = raw.split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length < 3) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.poll Sawal? | Option 1 | Option 2\n\nExample:\n.poll Chai ya Coffee? | Chai ☕ | Coffee ☕',
        }, { quoted: msg });
    }
    const [question, ...options] = parts;
    if (options.length > 12) {
        return sock.sendMessage(from, { text: '❌ Max 12 options.' }, { quoted: msg });
    }
    try {
        await sock.sendMessage(from, {
            poll: {
                name: question.slice(0, 300),
                values: options.slice(0, 12).map(o => o.slice(0, 100)),
                selectableCount: 1,
            },
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Poll banane mein error: ' + e.message }, { quoted: msg });
    }
}

module.exports = { pollCmd };
