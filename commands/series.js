/**
 * .series <name> — Internet Archive se authorized/public-domain series & episodes search.
 * .seriesdl <identifier> — episode/file download karke WhatsApp par bhejo (ya link do).
 *
 * Sirf legally distributable content (public domain / Creative Commons).
 * Latest copyrighted/paid series ke unauthorized links kabhi nahi.
 */
const archive = require('../lib/archive');

async function seriesCmd(sock, from, msg, args) {
    const query = (args || []).join(' ').trim();
    if (!query) {
        return await sock.sendMessage(from,
            { text: '❌ Series ka naam dein.\nExample: .series classic cartoons' },
            { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '📺', key: msg.key } });

    let results;
    try {
        results = await archive.searchArchive(query, 'series', 5);
    } catch (e) {
        return await sock.sendMessage(from,
            { text: `❌ Archive search mein error: ${e.message}` }, { quoted: msg });
    }

    if (!results.length) {
        return await sock.sendMessage(from, {
            text: `❌ "${query}" ka koi authorized copy archive.org par nahi mila.\n\nNote: Latest/paid series yahan nahi milengi — sirf public-domain aur authorized content available hai.`,
        }, { quoted: msg });
    }

    const lines = [`📺 *Series Search:* "${query}"\n`];
    for (const r of results) {
        let fileInfo = '';
        try {
            const files = await archive.getVideoFiles(r.identifier);
            if (files.length) {
                const f = files[0];
                fileInfo = ` — ${f.format}, ${archive.fmtSize(f.size)}`;
            }
        } catch (_) {}
        lines.push(`🎞️ *${r.title}*${r.year ? ` (${r.year})` : ''}${fileInfo}\n🆔 ${r.identifier}\n🔗 ${r.pageUrl}\n`);
    }
    lines.push(`💡 WhatsApp par pane ke liye: .seriesdl <identifier>\nExample: .seriesdl ${results[0].identifier}`);

    await sock.sendMessage(from, { text: lines.join('\n') }, { quoted: msg });
}

async function seriesdlCmd(sock, from, msg, args) {
    const identifier = (args || [])[0] && String((args || [])[0]).trim();
    if (!identifier) {
        return await sock.sendMessage(from,
            { text: '❌ Identifier dein.\nExample: .seriesdl <identifier>\nPehle .series <name> se identifier hasil karein.' },
            { quoted: msg });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(identifier)) {
        return await sock.sendMessage(from,
            { text: '❌ Ghalat identifier format.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });

    let files;
    try {
        files = await archive.getVideoFiles(identifier);
    } catch (e) {
        return await sock.sendMessage(from,
            { text: `❌ File list nahi mil saki: ${e.message}` }, { quoted: msg });
    }
    if (!files.length) {
        return await sock.sendMessage(from,
            { text: '❌ Is item mein koi downloadable video file nahi mili.' }, { quoted: msg });
    }

    const mp4s = files.filter(f => f.name.toLowerCase().endsWith('.mp4'));
    const pick = (mp4s.length ? mp4s : files)[0];

    if (pick.size > archive.MAX_SEND_BYTES) {
        const links = files.slice(0, 5).map(f =>
            `🎞️ ${f.name}\n📦 ${archive.fmtSize(f.size)}\n🔗 ${f.url}`).join('\n\n');
        return await sock.sendMessage(from, {
            text: `⚠️ File WhatsApp limit (${archive.fmtSize(archive.MAX_SEND_BYTES)}) se bari hai — direct download karein:\n\n${links}\n\n🌐 Full page: https://archive.org/details/${identifier}`,
        }, { quoted: msg });
    }

    try {
        await sock.sendMessage(from, {
            text: `⏳ Download ho raha hai: ${pick.name} (${archive.fmtSize(pick.size)})...`,
        }, { quoted: msg });
        const dl = await archive.downloadVideo(pick.url, identifier);
        if (!dl) {
            const links = files.slice(0, 3).map(f =>
                `🎞️ ${f.name} (${archive.fmtSize(f.size)})\n🔗 ${f.url}`).join('\n\n');
            return await sock.sendMessage(from, {
                text: `⚠️ File WhatsApp par bhejne ke liye bari hai. Direct download karein:\n\n${links}`,
            }, { quoted: msg });
        }
        const fs = require('fs');
        await sock.sendMessage(from, {
            video: fs.readFileSync(dl.path),
            caption: `📺 *${pick.name}*\n📦 ${archive.fmtSize(dl.size)}\n🌐 Source: https://archive.org/details/${identifier}\n✅ Public Domain / Authorized`,
        }, { quoted: msg });
        archive.cleanupTmp(dl.path);
    } catch (e) {
        const msg2 = e.message === 'FILE_TOO_LARGE'
            ? '⚠️ File WhatsApp limit se bari hai.'
            : `❌ Download mein error: ${e.message}`;
        await sock.sendMessage(from, { text: msg2 }, { quoted: msg });
    }
}

module.exports = { seriesCmd, seriesdlCmd };
