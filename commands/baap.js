/** .baap — random baap video bhejo (assets/baap/ folder se) */
const fs = require('fs');
const path = require('path');

const BAAP_DIR = path.join(__dirname, '..', 'assets', 'baap');

function getVideos() {
    try {
        return fs.readdirSync(BAAP_DIR)
            .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f))
            .map(f => path.join(BAAP_DIR, f));
    } catch {
        return [];
    }
}

async function baapCmd(sock, from, msg) {
    const videos = getVideos();
    if (!videos.length) {
        await sock.sendMessage(from, { text: '😅 Abhi koi video nahi hai!' }, { quoted: msg });
        return;
    }
    const pick = videos[Math.floor(Math.random() * videos.length)];
    await sock.sendMessage(from, {
        video: fs.readFileSync(pick),
        caption: '👑 *BAAP KA VIDEO* 👑'
    }, { quoted: msg });
}

module.exports = { baapCmd };
