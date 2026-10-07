/**
 * .vv — View-once bypass.
 * Reply to a view-once image/video/audio message with .vv
 * and the bot will send the media back so you can see it again.
 * Owner only.
 */
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function collectBuffer(stream) {
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

async function vvCmd(sock, from, msg, args, isAdmin) {
    if (!isAdmin) return sock.sendMessage(from, { text: '❌ Owner only.' }, { quoted: msg });

    for (const emoji of ['⏳', '🔓', '👁️']) {
        try { await sock.sendMessage(from, { react: { text: emoji, key: msg.key } }); } catch (e) {}
    }

    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) {
        return await sock.sendMessage(from,
            { text: '❌ Please *reply* to a view-once message with .vv' },
            { quoted: msg });
    }

    const viewOnce = quoted.viewOnceMessageV2 || quoted.viewOnceMessage;
    const message = viewOnce ? viewOnce.message : quoted;
    const vType = message && Object.keys(message)[0];

    if (!['imageMessage', 'videoMessage', 'audioMessage'].includes(vType)) {
        return await sock.sendMessage(from,
            { text: '❌ That is not a view-once media message.' },
            { quoted: msg });
    }

    try {
        const stream = await downloadContentFromMessage(message[vType], vType.replace('Message', ''));
        const buffer = await collectBuffer(stream);
        if (!buffer.length) throw new Error('empty media');

        if (vType === 'imageMessage') {
            await sock.sendMessage(from, { image: buffer, caption: '✅ View-once image recovered' }, { quoted: msg });
        } else if (vType === 'videoMessage') {
            await sock.sendMessage(from, { video: buffer, caption: '✅ View-once video recovered' }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { audio: buffer, mimetype: 'audio/mp4' }, { quoted: msg });
        }
    } catch (e) {
        await sock.sendMessage(from,
            { text: '❌ Could not download that view-once media. It may have expired.' },
            { quoted: msg });
    }
}

module.exports = { vvCmd };
