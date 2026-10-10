/**
 * DAILY LIFE REPLY COMMANDS — rozmarra ke Roman Urdu replies.
 * Har command ka predefined reply. Owner-only (adminOnly list mein).
 *
 * Usage:
 *   .salam                  -> isi chat mein reply
 *   .salam 923001234567     -> us number ke DM mein reply
 *   Agar command kisi message ko quote karke chalaya jaye to reply usi
 *   quoted message ke saath jata hai.
 */

const REPLIES = {
    // 1. Salam aur Greetings
    salam: 'Assalam-o-Alaikum! ❤️',
    wsalam: 'Wa-Alaikum-Assalam! Allah aap ko khush rakhe. 🤍',
    subah: 'Subah bakhair! Aap ka din khushiyon bhara ho. 🌅',
    shab: 'Shab bakhair! Allah aap ko sukoon wali neend de. 🌙',

    // 2. Maafi aur Sorry
    sorry: 'Mujhe maaf kar dein, agar meri kisi baat se aap ka dil dukha ho. 🙏',
    maafi: 'Dil se maafi chahta hoon, mujh se ghalti ho gayi. 🤲',

    // 3. Shukriya aur Appreciation
    shukriya: 'Bohat bohat shukriya! Allah aap ko iska behtareen ajar de. 🤲',
    thanks: 'Thanks a lot! Dil se shukriya ada karta hoon. ❤️',

    // 4. Ijazat aur Permission
    ijazat: 'Agar aap ijazat dein to main ek baat pooch sakta hoon? 🙏',

    // 5. Respect aur Adab
    respect: 'Aap ki izzat mere liye bohat aham hai. 🤍',
    adab: 'Adab se arz hai. 🙏',

    // 6. Dua aur Khairiyat
    dua: 'Allah aap ko hamesha khush, salamat aur kamyab rakhe. Ameen. 🤲',
    khairiyat: 'Alhamdulillah, sab khairiyat hai. Aap apna batayein. 😊',
    mashallah: 'Mashallah! Allah nazar-e-bad se mehfooz rakhe. 🧿',

    // 7. Baat Cheet aur Daily Life
    haal: 'Kya haal hain? Sab khairiyat? 😊',
    busy: 'Thoda busy hoon, thodi der mein baat karta hoon. ⏳',
    ok: 'Theek hai, samajh gaya. 👍',

    // 8. Dosti aur Mohabbat Bhare Alfaaz
    dost: 'Dosti ka rishta duniya ka sab se pyara rishta hota hai. ❤️',
    mohabbat: 'Mohabbat bantne se barhti hai. 💕',

    // 9. Alvida aur Conversation End
    takecare: 'Apna khayal rakhiye ga. Allah Hafiz. 🤍',
    bye: 'Achha ji, phir baat hogi. Apna khayal rakhiye ga. 👋',
    allahhafiz: 'Allah Hafiz! Phir mulaqat hogi. 🤲',
};

const COMMANDS = Object.keys(REPLIES);

async function dailyLifeCmd(sock, from, msg, cmd, args) {
    const text = REPLIES[cmd];
    if (!text) return false;

    // Recipient: pehla arg agar number ho to uske DM mein, warna isi chat mein
    let target = from;
    const numArg = String((args && args[0]) || '').replace(/[^0-9]/g, '');
    if (numArg.length >= 10) target = numArg + '@s.whatsapp.net';

    if (!target) {
        // recipient identify na ho to message NA bhejo, clear error dikhao
        await sock.sendMessage(from, {
            text: '❌ Recipient identify nahi hua — message nahi bheja gaya.'
        }, { quoted: msg });
        return true;
    }

    const opts = target === from ? { quoted: msg } : {};
    await sock.sendMessage(target, { text }, opts);
    return true;
}

module.exports = { dailyLifeCmd, REPLIES, COMMANDS };
