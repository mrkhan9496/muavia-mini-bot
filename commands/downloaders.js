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

// Fallback APIs — ek fail ho to agli try karo (Muavia ki standing instruction: 4-5 APIs)
async function cobaltAio(url) {
    const res = await axios.post('https://cobalt-api.kwiatekmiki.com', {
        url, videoQuality: '720', filenameStyle: 'basic',
    }, { timeout: TIMEOUT, headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Content-Type': 'application/json' } });
    const data = res.data;
    if (!data || !data.url) throw new Error('Cobalt: koi URL nahi mila');
    return { title: 'Video', links: [{ url: data.url, type: 'video/mp4', quality: '720' }] };
}

async function downloadWithFallback(url) {
    const apis = [
        { name: 'Emmy', fn: emmyAio },
        { name: 'Cobalt', fn: cobaltAio },
    ];
    let lastErr;
    for (const api of apis) {
        try {
            console.log(`[downloader] Trying ${api.name}...`);
            return await api.fn(url);
        } catch (e) {
            console.log(`[downloader] ${api.name} failed: ${e.message}`);
            lastErr = e;
        }
    }
    throw lastErr || new Error('Sab APIs fail ho gayin');
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
    const result = await downloadWithFallback(url);
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

module.exports = { tiktokCmd, instaCmd, fbCmd, pinterestCmd, songCmd, fullppCmd, pairCmd };

// ============================ PAIR ============================
// .pair — public: pairing info (mini bot single-session hai)
// Dono bots mein public — 2026-10-16
async function pairCmd(sock, from, msg, args) {
    const text =
        `📱 *Pairing Info*\n\n` +
        `Ye personal bot hai (BABA SAB JANTA HAI).\n` +
        `Apna number pair karne ke liye bot ke pairing page par jao\n` +
        `ya owner se rabta karo.\n\n` +
        `> *© PERSONAL BOT — MUAVIA*`;
    await sock.sendMessage(from, { text }, { quoted: msg });
}

// ============================ SONG / MP3 ============================
// .song <name or YouTube link> — YouTube se MP3 download (Emmy savetube API)
// Dono bots mein (MD bot mein pehle se hai, mini bot mein naya — 2026-10-16)
const yts = require('yt-search');

async function emmySavetubeMp3(youtubeUrl) {
    const res = await axios.get(`${EMMY_BASE}/api/savetube`, {
        params: { url: youtubeUrl, format: 'mp3' },
        timeout: 60000,
        headers: { 'User-Agent': UA },
    });
    const r = res?.data?.result;
    if (res?.data?.status && r?.download_url) {
        return { download: r.download_url, title: r.title || 'Audio', cover: r.cover };
    }
    throw new Error('Emmy MP3: koi download URL nahi mila');
}

async function songCmd(sock, from, msg, args) {
    try {
        const query = args.join(' ').trim();
        if (!query) {
            await sock.sendMessage(from, { text: '❌ Gaane ka naam ya YouTube link do!\nExample: .song naat rasool' }, { quoted: msg });
            return;
        }
        let videoUrl, videoTitle, videoThumb;
        if (/youtube\.com|youtu\.be/i.test(query)) {
            videoUrl = query; videoTitle = 'YouTube Audio'; videoThumb = null;
        } else {
            const { videos } = await yts(query);
            if (!videos?.length) {
                await sock.sendMessage(from, { text: '❌ Koi result nahi mila!' }, { quoted: msg });
                return;
            }
            videoUrl = videos[0].url; videoTitle = videos[0].title; videoThumb = videos[0].thumbnail;
        }
        await sock.sendMessage(from, { text: `🎵 *${videoTitle}*\n⏳ MP3 download ho raha hai...` }, { quoted: msg });

        const { download, title } = await emmySavetubeMp3(videoUrl);

        // MP3 download karke bhejo (direct URL kabhi expire ho sakta hai)
        const tmpPath = await downloadToTemp(download, '.mp3');
        try {
            await sock.sendMessage(from, {
                audio: fs.readFileSync(tmpPath),
                mimetype: 'audio/mpeg',
                fileName: `${(title || videoTitle).replace(/[^\w\s-]/g, '').slice(0, 60)}.mp3`,
            }, { quoted: msg });
        } finally {
            cleanup(tmpPath);
        }
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ ${e.message || 'MP3 download fail ho gaya. Dobara try karo.'}` }, { quoted: msg });
    }
}

// Full-DP maker: photo ko 640x640 square par fit karo (poori photo nazar aye,
// kuch crop na ho) — background mein blurred copy, upar asli photo centered.
async function makeFullDp(inputPath) {
    const outPath = inputPath.replace(/(\.[^.]+)$/, '_fullpp.jpg');
    const vf = 'split[a][b];' +
        '[a]scale=640:640:force_original_aspect_ratio=increase,crop=640:640,boxblur=20[bg];' +
        '[b]scale=640:640:force_original_aspect_ratio=decrease[fg];' +
        '[bg][fg]overlay=(W-w)/2:(H-h)/2';
    await execFileAsync('ffmpeg', ['-y', '-i', inputPath, '-vf', vf, '-frames:v', '1', '-q:v', '3', outPath]);
    return outPath;
}

// ============================ FULLPP ============================
// .fullpp — reply to a photo → set as bot's profile picture (owner only)
// FULL photo (bina crop): square canvas + blurred background — 2026-10-16
async function fullppCmd(sock, from, msg, args, isOwner) {
    try {
        if (!isOwner) {
            await sock.sendMessage(from, { text: '❌ Ye command sirf owner ke liye hai!' }, { quoted: msg });
            return;
        }
        const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        const imgMsg = quoted?.imageMessage;
        // Direct photo bhejo (caption mein .fullpp) ya kisi photo par reply karo
        const direct = msg.message?.imageMessage;
        let buf = null;
        const { downloadMediaMessage } = require('@whiskeysockets/baileys');
        if (imgMsg) {
            buf = await downloadMediaMessage({ key: msg.key, message: quoted }, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        } else if (direct) {
            buf = await downloadMediaMessage(msg, 'buffer', {}, { logger: undefined, reuploadRequest: sock.updateMediaMessage });
        }
        if (!buf?.length) {
            await sock.sendMessage(from, { text: '❌ Kisi *photo* par reply kar ke .fullpp likho!\nYa photo bhejo caption mein .fullpp likh kar.' }, { quoted: msg });
            return;
        }
        await sock.sendMessage(from, { react: { text: '⏳', key: msg.key } });
        // Full-DP: poori photo square canvas par (kuch crop nahi hoga)
        let tmpIn = null, tmpOut = null;
        try {
            tmpIn = path.join(os.tmpdir(), `fullpp_${Date.now()}.jpg`);
            fs.writeFileSync(tmpIn, buf);
            tmpOut = await makeFullDp(tmpIn);
            const fullBuf = fs.readFileSync(tmpOut);
            await sock.updateProfilePicture(sock.user.id, fullBuf);
        } finally {
            cleanup(tmpIn, tmpOut);
        }
        await sock.sendMessage(from, { react: { text: '✅', key: msg.key } });
        await sock.sendMessage(from, { text: '✅ *Bot ki DP update ho gayi!* (full photo — bina crop)' }, { quoted: msg });
    } catch (e) {
        await sock.sendMessage(from, { text: `❌ DP update fail: ${e.message || 'dobara try karo'}` }, { quoted: msg });
    }
}
