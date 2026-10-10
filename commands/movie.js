/**
 * .movie <name> — Movie/TV show info (metadata only, no piracy).
 *
 * Providers (in order):
 *   1. OMDb API (needs OMDB_API_KEY in env — free 1,000 req/day at omdbapi.com)
 *   2. TVmaze (keyless, TV shows) — fallback
 *
 * Only metadata: title/year/genre/rating/poster/plot/cast.
 * Trailer links go to YouTube search (legal).
 */
const axios = require('axios');
const archive = require('../lib/archive');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 20000;

async function fetchOmdb(title) {
    const key = process.env.OMDB_API_KEY;
    if (!key) throw new Error('OMDB_API_KEY not configured');
    const res = await axios.get('http://www.omdbapi.com/', {
        params: { apikey: key, t: title, plot: 'short' },
        timeout: TIMEOUT, headers: { 'User-Agent': UA },
    });
    const d = res.data;
    if (!d || d.Response === 'False') throw new Error('OMDb: ' + (d.Error || 'not found'));
    return {
        title: d.Title,
        year: d.Year,
        genre: d.Genre,
        rating: d.imdbRating && d.imdbRating !== 'N/A' ? `⭐ ${d.imdbRating}/10 (IMDb)` : null,
        plot: d.Plot,
        cast: d.Actors,
        poster: d.Poster && d.Poster !== 'N/A' ? d.Poster : null,
        imdbId: d.imdbID,
        type: d.Type,
    };
}

async function fetchTvmaze(title) {
    const res = await axios.get('https://api.tvmaze.com/search/shows', {
        params: { q: title },
        timeout: TIMEOUT, headers: { 'User-Agent': UA },
    });
    const arr = res.data;
    if (!Array.isArray(arr) || !arr.length) throw new Error('TVmaze: not found');
    const s = arr[0].show;
    const stripHtml = (h) => String(h || '').replace(/<[^>]*>/g, '').trim();
    return {
        title: s.name,
        year: (s.premiered || '').slice(0, 4),
        genre: (s.genres || []).join(', '),
        rating: s.rating && s.rating.average ? `⭐ ${s.rating.average}/10 (TVmaze)` : null,
        plot: stripHtml(s.summary),
        cast: null,
        poster: s.image && (s.image.original || s.image.medium),
        imdbId: s.externals && s.externals.imdb,
        type: 'series',
    };
}

function trailerUrl(title, year) {
    return `https://www.youtube.com/results?search_query=${encodeURIComponent(title + ' ' + (year || '') + ' official trailer')}`;
}

// Legal "where to watch" links only (JustWatch aggregates Netflix/Prime/Disney+ availability by country).
// No piracy-app/site links, ever.
function watchLinks(title) {
    const q = encodeURIComponent(title);
    return [
        `📺 Kahan dekhen: https://www.justwatch.com/pk/search?q=${q}`,
        `🎬 Netflix: https://www.netflix.com/search?q=${q}`,
    ].join('\n');
}

async function movieCmd(sock, from, msg, args) {
    const query = (args || []).join(' ').trim();
    if (!query) {
        return await sock.sendMessage(from,
            { text: '❌ Please provide a movie/show name.\nExample: .movie Interstellar' },
            { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '🎬', key: msg.key } });

    let info = null;
    let source = '';
    const errors = [];
    try {
        info = await fetchOmdb(query);
        source = 'OMDb';
    } catch (e) {
        errors.push('OMDb: ' + e.message);
        try {
            info = await fetchTvmaze(query);
            source = 'TVmaze';
        } catch (e2) {
            errors.push('TVmaze: ' + e2.message);
        }
    }

    if (!info) {
        const needKey = errors.some((e) => e.includes('not configured'));
        return await sock.sendMessage(from, {
            text: needKey
                ? '❌ Movie database not fully configured.\nTried OMDb (needs OMDB_API_KEY — free at omdbapi.com) and TVmaze, both failed for this title.'
                : `❌ Could not find "${query}". Check the spelling and try again.`,
        }, { quoted: msg });
    }

    const lines = [
        `🎬 *${info.title}*${info.year ? ` (${info.year})` : ''}`,
        info.genre && info.genre !== 'N/A' ? `🎭 ${info.genre}` : null,
        info.rating || null,
        info.type ? `📺 Type: ${info.type}` : null,
        info.cast && info.cast !== 'N/A' ? `👥 Cast: ${info.cast}` : null,
        info.plot && info.plot !== 'N/A' ? `\n📝 ${info.plot}` : null,
        `\n🔗 IMDb: ${info.imdbId ? `https://www.imdb.com/title/${info.imdbId}/` : 'https://www.imdb.com/find?q=' + encodeURIComponent(info.title)}`,
        `🎞️ Trailer: ${trailerUrl(info.title, info.year)}`,
        `${watchLinks(info.title)}`,
        `\n_Source: ${source}_`,
    ].filter(Boolean);

    // Internet Archive: public-domain / authorized downloadable copies
    try {
        const results = await archive.searchArchive(info.title, 'movie', 3);
        if (results.length) {
            lines.push('\n📥 *Download (Public Domain / Authorized):*');
            for (const r of results) {
                let fileInfo = '';
                try {
                    const files = await archive.getVideoFiles(r.identifier);
                    if (files.length) {
                        const f = files[0];
                        fileInfo = ` — ${f.format}, ${archive.fmtSize(f.size)}`;
                    }
                } catch (_) {}
                lines.push(`\n🎞️ *${r.title}*${r.year ? ` (${r.year})` : ''}${fileInfo}\n🔗 ${r.pageUrl}`);
            }
            lines.push(`\n💡 WhatsApp par pane ke liye: .moviedl ${results[0].identifier}`);
        } else {
            lines.push('\n📥 *Download:* Is title ka authorized downloadable copy archive.org par nahi mila.');
        }
    } catch (e) {
        lines.push('\n📥 *Download:* Archive search mein error — baad mein try karein.');
    }

    const caption = lines.join('\n');
    try {
        if (info.poster) {
            await sock.sendMessage(from, { image: { url: info.poster }, caption }, { quoted: msg });
        } else {
            await sock.sendMessage(from, { text: caption }, { quoted: msg });
        }
    } catch (e) {
        await sock.sendMessage(from, { text: caption }, { quoted: msg });
    }
}

module.exports = { movieCmd, moviedlCmd };

/**
 * .moviedl <identifier> — Internet Archive se public-domain movie download
 * karke WhatsApp par bhejo. 64MB se bari file ho to direct link do.
 */
async function moviedlCmd(sock, from, msg, args) {
    const identifier = (args || [])[0] && String((args || [])[0]).trim();
    if (!identifier) {
        return await sock.sendMessage(from,
            { text: '❌ Identifier dein.\nExample: .moviedl the-bank-1915-directed-by-charlie-chaplin\nPehle .movie <name> se identifier hasil karein.' },
            { quoted: msg });
    }
    if (!/^[a-zA-Z0-9._-]+$/.test(identifier)) {
        return await sock.sendMessage(from,
            { text: '❌ Ghalat identifier format.' }, { quoted: msg });
    }

    await sock.sendMessage(from, { react: { text: '⬇️', key: msg.key } });
    const statusMsg = await sock.sendMessage(from,
        { text: '⏳ File dhoond raha hoon...' }, { quoted: msg });

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

    // Sab se chhoti MP4 prefer karo
    const mp4s = files.filter(f => f.name.toLowerCase().endsWith('.mp4'));
    const pick = (mp4s.length ? mp4s : files)[0];

    // Bari file → sirf direct link
    if (pick.size > archive.MAX_SEND_BYTES) {
        const links = files.slice(0, 5).map(f =>
            `🎞️ ${f.name}\n📦 ${archive.fmtSize(f.size)}\n🔗 ${f.url}`).join('\n\n');
        return await sock.sendMessage(from, {
            text: `⚠️ File WhatsApp limit (${archive.fmtSize(archive.MAX_SEND_BYTES)}) se bari hai — direct download karein:\n\n${links}\n\n🌐 Full page: https://archive.org/details/${identifier}`,
        }, { quoted: msg });
    }

    // Chhoti file → download karke WhatsApp par bhejo
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
            caption: `🎬 *${pick.name}*\n📦 ${archive.fmtSize(dl.size)}\n🌐 Source: https://archive.org/details/${identifier}\n✅ Public Domain / Authorized`,
        }, { quoted: msg });
        archive.cleanupTmp(dl.path);
    } catch (e) {
        const msg2 = e.message === 'FILE_TOO_LARGE'
            ? '⚠️ File WhatsApp limit se bari hai.'
            : `❌ Download mein error: ${e.message}`;
        await sock.sendMessage(from, { text: msg2 }, { quoted: msg });
    }
}
