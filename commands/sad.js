/** .sad — random sad video bhejo (assets/sad/ folder se) */
const fs = require('fs');
const path = require('path');

const SAD_DIR = path.join(__dirname, '..', 'assets', 'sad');

function getVideos() {
    try {
        return fs.readdirSync(SAD_DIR)
            .filter(f => /\.(mp4|mov|mkv|webm)$/i.test(f))
            .map(f => path.join(SAD_DIR, f));
    } catch {
        return [];
    }
}

async function sadCmd(sock, from, msg) {
    const videos = getVideos();
    if (!videos.length) {
        await sock.sendMessage(from, { text: '😅 Abhi koi video nahi hai!' }, { quoted: msg });
        return;
    }
    const pick = videos[Math.floor(Math.random() * videos.length)];
    await sock.sendMessage(from, {
        video: fs.readFileSync(pick),
        caption: '🥀 *BABA KA SAD VIDEO* 🥀'
    }, { quoted: msg });
}

module.exports = { sadCmd };
