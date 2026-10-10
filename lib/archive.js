/**
 * Internet Archive (archive.org) helper — public-domain / authorized downloads only.
 *
 * Sirf wohi content jo archive.org par legally distributable hai
 * (public domain, Creative Commons). Koi pirated/copyrighted material nahi.
 *
 * Docs: https://archive.org/developers/
 */
const axios = require('axios');
const fs = require('fs');
const os = require('os');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 25000;
// WhatsApp direct-send limit (is se bara ho to sirf link do)
const MAX_SEND_BYTES = 64 * 1024 * 1024; // 64MB

const VIDEO_EXTS = ['.mp4', '.ogv', '.webm', '.mov', '.mkv', '.avi'];

/**
 * archive.org par search karo.
 * @param {string} query - search text
 * @param {'movie'|'series'} kind
 * @param {number} rows
 */
async function searchArchive(query, kind = 'movie', rows = 5) {
    let q;
    if (kind === 'series') {
        q = `(${query}) AND mediatype:movies AND (collection:classic_tv OR collection:tv OR collection:television)`;
    } else {
        q = `(${query}) AND mediatype:movies AND (collection:feature_films OR collection:public_domain OR collection:prelinger)`;
    }
    const res = await axios.get('https://archive.org/advancedsearch.php', {
        params: {
            q,
            'fl[]': ['identifier', 'title', 'year', 'description'],
            rows,
            page: 1,
            output: 'json',
        },
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA },
    });
    const docs = (res.data && res.data.response && res.data.response.docs) || [];
    return docs.map(d => ({
        identifier: d.identifier,
        title: d.title,
        year: d.year,
        pageUrl: `https://archive.org/details/${d.identifier}`,
    }));
}

/**
 * Kisi item ki downloadable video files nikalo (size ke saath, chhoti pehle).
 */
async function getVideoFiles(identifier) {
    const res = await axios.get(`https://archive.org/metadata/${identifier}`, {
        timeout: TIMEOUT, headers: { 'User-Agent': UA },
    });
    const files = (res.data && res.data.files) || [];
    const vids = files
        .filter(f => {
            const name = String(f.name || '').toLowerCase();
            return VIDEO_EXTS.some(ext => name.endsWith(ext)) && f.name && !String(f.name).includes('_meta.');
        })
        .map(f => ({
            name: f.name,
            size: parseInt(f.size || '0', 10),
            format: String(f.format || '').toUpperCase() || 'VIDEO',
            url: `https://archive.org/download/${identifier}/${encodeURIComponent(f.name)}`,
        }))
        .sort((a, b) => a.size - b.size);
    return vids;
}

function fmtSize(bytes) {
    if (!bytes) return '?';
    const mb = bytes / 1024 / 1024;
    return mb >= 1024 ? `${(mb / 1024).toFixed(2)}GB` : `${mb.toFixed(1)}MB`;
}

/**
 * Video file download karo (sirf MAX_SEND_BYTES tak).
 * @returns {Promise<{path, size}|null>}
 */
async function downloadVideo(url, identifier) {
    const tmp = path.join(os.tmpdir(), `archive_${identifier}_${Date.now()}.mp4`);
    const res = await axios.get(url, {
        responseType: 'stream',
        timeout: 120000,
        headers: { 'User-Agent': UA },
        maxContentLength: MAX_SEND_BYTES + 1024 * 1024,
    });
    // Pehle hi bara ho to cancel
    const len = parseInt(res.headers['content-length'] || '0', 10);
    if (len > MAX_SEND_BYTES) {
        res.data.destroy();
        return null;
    }
    await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(tmp);
        let total = 0;
        res.data.on('data', (chunk) => {
            total += chunk.length;
            if (total > MAX_SEND_BYTES) {
                res.data.destroy();
                w.destroy();
                try { fs.unlinkSync(tmp); } catch (_) {}
                reject(new Error('FILE_TOO_LARGE'));
            }
        });
        res.data.pipe(w);
        w.on('finish', resolve);
        w.on('error', reject);
        res.data.on('error', reject);
    });
    const size = fs.statSync(tmp).size;
    if (size > MAX_SEND_BYTES) {
        try { fs.unlinkSync(tmp); } catch (_) {}
        return null;
    }
    return { path: tmp, size };
}

function cleanupTmp(p) {
    try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (_) {}
}

module.exports = {
    searchArchive,
    getVideoFiles,
    downloadVideo,
    cleanupTmp,
    fmtSize,
    MAX_SEND_BYTES,
};
