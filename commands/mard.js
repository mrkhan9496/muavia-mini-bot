/** .mard — random video bhejo (assets/mard/ folder se) */
const fs = require('fs');
const path = require('path');

const MARD_DIR = path.join(__dirname, '..', 'assets', 'mard');

function getVideos() {
    try {
        return fs.readdirSync(MARD_DIR)
            .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f))
            .map(f => path.join(MARD_DIR, f));
    } catch {
        return [];
    }
}

async function mardCmd(sock, from, msg) {
    const videos = getVideos();
    if (!videos.length) {
        await sock.sendMessage(from, { text: '😅 Abhi koi video nahi hai!' }, { quoted: msg });
        return;
    }
    const pick = videos[Math.floor(Math.random() * videos.length)];
    await sock.sendMessage(from, {
        video: fs.readFileSync(pick),
        caption: '🎲 *BABA KA RANDOM VIDEO* 🎲'
    }, { quoted: msg });
}

module.exports = { mardCmd };
