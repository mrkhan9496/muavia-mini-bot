/**
 * Social media downloaders via Emmy API (https://apis.emmyhenztech.xyz)
 * .tiktok | .insta | .fb | .pinterest — <url>
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);

const EMMY_BASE = process.env.EMMY_API_BASE || 'https://apis.emmyhenztech.xyz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const TIMEOUT = 30000;

// Download a remote file to a temp path
async function downloadToTemp(url, ext) {
    const tmpPath = path.join(os.tmpdir(), `dl_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);
    const res = await axios.get(url, { responseType: 'stream', timeout: 60000, headers: { 'User-Agent': UA } });
    await new Promise((resolve, reject) => {
        const w = fs.createWriteStream(tmpPath);
        res.data.pipe(w);
        w.on('finish', resolve);
        w.on('error', reject);
    });
    return tmpPath;
}

// Remux video with faststart so WhatsApp can stream/play it
async function faststartRemux(inputPath) {
    const outPath = inputPath.replace(/(\.[^.]+)$/, '_fs$1');
    try {
        await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outPath]);
        return outPath;
    } catch {
        return inputPath; // fallback: send original
    }
}

function cleanup(...paths) {
    for (const p of paths) { try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch {} }
}

async function emmyAio(url) {
    const res = await axios.get(`${EMMY_BASE}/api/aio`, {
        params: { url }, timeout: TIMEOUT, headers: { 'User-Agent': UA },
    });
    const data = res.data;
    if (!data || data.status === false) throw new Error((data && data.error) || 'API error');
    return data.result;
}

function pickBest(links, wantImage = false) {
    if (!Array.isArray(links) || !links.length) throw new Error('Koi media nahi mila');
    const withUrl = links.filter((l) => l.url && !/placeholder|ref=aio_/i.test(l.url));
    const pool = withUrl.length ? withUrl : links.filter((l) => l.url);
    if (!pool.length) throw new Error('Koi download link nahi mila');
    if (wantImage) {
        const img = pool.find((l) => /jpg|jpeg|png|webp|image/i.test(l.type || ''));
        if (img) return img;
    }
    const vids = pool.filter((l) => /mp4|video/i.test(l.type || ''));
    const vpool = vids.length ? vids : pool;
    const hd = vpool.find((l) => /hd|1080|720/i.test(`${l.quality || ''} ${l.label || ''}`));
    return hd || vpool[0];
}

async function sendDownload(sock, from, msg, url, label) {
    await sock.sendMessage(from, { text: `⏳ *${label} download ho raha hai...*` }, { quoted: msg });
    const result = await emmyAio(url);
    const best = pickBest(result.links);
    const isImage = /jpg|jpeg|png|webp|image/i.test(best.type || '');
    const caption = `✅ *${result.title || label}*\n\n> *© PERSONAL BOT — MUAVIA*`;
    let tmpPath = null, fsPath = null;
    try {
        if (isImage) {
            // Images: send from URL (no faststart issue)
            await sock.sendMessage(from, { image: { url: best.url }, caption }, { quoted: msg });
        } else {
            // Videos: download locally, remux with faststart, send file
            // (WhatsApp can't play videos without moov atom at front)
            tmpPath = await downloadToTemp(best.url, '.mp4');
            fsPath = await faststartRemux(tmpPath);
            await sock.sendMessage(from, { video: fs.readFileSync(fsPath), caption }, { quoted: msg });
        }
    } finally {
        cleanup(tmpPath, fsPath);
    }
}

const URL_RE = /https?:\/\/[^\s]+/i;

function extractUrl(args, label, example) {
    const text = args.join(' ');
    const m = text.match(URL_RE);
    if (!m) throw new Error(`❌ Link do!\nExample: ${example}`);
    return m[0];
}

async function tiktokCmd(sock, from, msg, args) {
    try {
        const url = extractUrl(args, 'TikTok', '.tiktok https://www.tiktok.com/@user/video/123');
        if (!/tiktok\.com/i.test(url)) {
            await sock.sendMessage(from, { text: '❌ Ye TikTok link nahi lag raha!' }, { quoted: msg });
            return;
        }
        await sendDownload(sock, from, msg, url, 'TikTok');
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ ${e.message || 'Download fail ho gaya. Dobara try karo.'}` }, { quoted: msg });
    }
}

async function instaCmd(sock, from, msg, args) {
    try {
        const url = extractUrl(args, 'Instagram', '.insta https://www.instagram.com/reel/XXXX/');
        if (!/instagram\.com|instagr\.am/i.test(url)) {
            await sock.sendMessage(from, { text: '❌ Ye Instagram link nahi lag raha!' }, { quoted: msg });
            return;
        }
        await sendDownload(sock, from, msg, url, 'Instagram');
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ ${e.message || 'Download fail ho gaya. Post public hai na? Dobara try karo.'}` }, { quoted: msg });
    }
}

async function fbCmd(sock, from, msg, args) {
    try {
        const url = extractUrl(args, 'Facebook', '.fb https://www.facebook.com/...');
        if (!/facebook\.com|fb\.watch/i.test(url)) {
            await sock.sendMessage(from, { text: '❌ Ye Facebook link nahi lag raha!' }, { quoted: msg });
            return;
        }
        await sendDownload(sock, from, msg, url, 'Facebook');
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ ${e.message || 'Download fail ho gaya. Dobara try karo.'}` }, { quoted: msg });
    }
}

async function pinterestCmd(sock, from, msg, args) {
    try {
        const url = extractUrl(args, 'Pinterest', '.pinterest https://www.pinterest.com/pin/XXXX/');
        if (!/pinterest\.com|pin\.it/i.test(url)) {
            await sock.sendMessage(from, { text: '❌ Ye Pinterest link nahi lag raha!' }, { quoted: msg });
            return;
        }
        await sock.sendMessage(from, { text: '⏳ *Pinterest download ho raha hai...*' }, { quoted: msg });
        const result = await emmyAio(url);
        // Pinterest: prefer video, fallback to image
        let best;
        try { best = pickBest(result.links, false); } catch { best = pickBest(result.links, true); }
        const isImage = /jpg|jpeg|png|webp|image/i.test(best.type || '');
        const caption = `✅ *${result.title || 'Pinterest'}*\n\n> *© PERSONAL BOT — MUAVIA*`;
        let tmpPath = null, fsPath = null;
        try {
            if (isImage) {
                await sock.sendMessage(from, { image: { url: best.url }, caption }, { quoted: msg });
            } else {
                tmpPath = await downloadToTemp(best.url, '.mp4');
                fsPath = await faststartRemux(tmpPath);
                await sock.sendMessage(from, { video: fs.readFileSync(fsPath), caption }, { quoted: msg });
            }
        } finally {
            cleanup(tmpPath, fsPath);
        }
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ ${e.message || 'Download fail ho gaya. Dobara try karo.'}` }, { quoted: msg });
    }
}

module.exports = { tiktokCmd, instaCmd, fbCmd, pinterestCmd };
