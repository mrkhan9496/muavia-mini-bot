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

module.exports = { movieCmd };
