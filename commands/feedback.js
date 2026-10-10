/**
 * .feedback <message> — owner ko feedback/mashwara bhejo.
 * Koi bhi user bhej sakta hai; message owner ke DM mein jata hai.
 *
 * Example: .feedback Bot bohat acha hai!
 */
const OWNER = (process.env.OWNER_NUMBER || '').replace(/[^0-9]/g, '');

async function feedbackCmd(sock, from, msg, args) {
    const text = (args || []).join(' ').trim();
    if (!text) {
        return sock.sendMessage(from, {
            text: '❌ Usage:\n.feedback <tumhara message>\nExample: .feedback Bot bohat acha hai!',
        }, { quoted: msg });
    }
    if (!OWNER) {
        return sock.sendMessage(from, {
            text: '❌ Owner number configure nahi (.env mein OWNER_NUMBER).',
        }, { quoted: msg });
    }
    try {
        const sender = msg.key.participant || from;
        await sock.sendMessage(OWNER + '@s.whatsapp.net', {
            text: `📩 *New Feedback*\n\n👤 From: ${sender}\n💬 ${text.slice(0, 500)}`,
        });
        await sock.sendMessage(from, {
            text: '✅ Feedback bhej diya gaya! Shukriya. 🙏',
        }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Feedback nahi bheja ja saka: ' + e.message }, { quoted: msg });
    }
}

module.exports = { feedbackCmd };
