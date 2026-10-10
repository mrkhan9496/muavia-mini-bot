/**
 * STICKER TOOLS — ffmpeg se convert.
 *
 * .sticker   — replied image/video (6s tak) ko sticker banao
 * .toimg     — replied sticker ko wapas image banao
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

function tmpFile(ext) {
    return path.join(os.tmpdir(), `stk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`);
}
function cleanup(...ps) {
    for (const p of ps) try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

async function downloadQuotedMedia(sock, msg) {
    const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
    if (!quoted) return null;
    const m = quoted.imageMessage || quoted.videoMessage || quoted.stickerMessage;
    if (!m) return null;
    const { downloadMediaMessage } = require('@whiskeysockets/baileys');
    const buf = await downloadMediaMessage(
        { key: msg.key, message: quoted },
        'buffer',
        {},
        { logger: undefined, reuploadRequest: sock.updateMediaMessage }
    );
    const kind = quoted.imageMessage ? 'image' : quoted.videoMessage ? 'video' : 'sticker';
    return { buf, kind };
}

async function stickerCmd(sock, from, msg) {
    const media = await downloadQuotedMedia(sock, msg).catch(() => null);
    if (!media || media.kind === 'sticker') {
        return sock.sendMessage(from, {
            text: '❌ Kisi image ya chhoti video (6s) ko reply karke .sticker likhein.',
        }, { quoted: msg });
    }
    const inp = tmpFile(media.kind === 'video' ? 'mp4' : 'jpg');
    const out = tmpFile('webp');
    try {
        fs.writeFileSync(inp, media.buf);
        // 512x512 webp sticker (WhatsApp standard)
        await execFileAsync('ffmpeg', [
            '-v', 'error', '-y', '-i', inp,
            '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
            '-t', '6', '-r', '15', '-c:v', 'libwebp', '-lossless', '0',
            '-q:v', '80', '-preset', 'picture', '-an', '-vsync', '0', out,
        ]);
        await sock.sendMessage(from, { sticker: fs.readFileSync(out) }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Sticker banane mein error: ' + e.message }, { quoted: msg });
    } finally {
        cleanup(inp, out);
    }
}

async function toimgCmd(sock, from, msg) {
    const media = await downloadQuotedMedia(sock, msg).catch(() => null);
    if (!media || media.kind !== 'sticker') {
        return sock.sendMessage(from, {
            text: '❌ Kisi sticker ko reply karke .toimg likhein.',
        }, { quoted: msg });
    }
    const inp = tmpFile('webp');
    const out = tmpFile('png');
    try {
        fs.writeFileSync(inp, media.buf);
        await execFileAsync('ffmpeg', ['-v', 'error', '-y', '-i', inp, out]);
        await sock.sendMessage(from, { image: fs.readFileSync(out) }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: '❌ Convert mein error: ' + e.message }, { quoted: msg });
    } finally {
        cleanup(inp, out);
    }
}

module.exports = { stickerCmd, toimgCmd };
