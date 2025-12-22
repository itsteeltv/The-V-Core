const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';

let isScanning = false;

window.addEventListener('load', () => {
    runMiniScan();
    setInterval(runMiniScan, 30000); // Je conseille 30s pour éviter le cache Twitch
});

async function getTwitchToken() {
    const STORAGE_KEY = 'twitch_access_token';
    const EXPIRY_KEY = 'twitch_token_expiry';
    const cachedToken = localStorage.getItem(STORAGE_KEY);
    const expiryTime = localStorage.getItem(EXPIRY_KEY);
    const now = Date.now();

    if (cachedToken && expiryTime && now < (parseInt(expiryTime) - 60000)) {
        return cachedToken;
    }

    try {
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, {
            method: 'POST'
        });
        const data = await response.json();
        if (data.access_token) {
            const absoluteExpiry = now + (data.expires_in * 1000);
            localStorage.setItem(STORAGE_KEY, data.access_token);
            localStorage.setItem(EXPIRY_KEY, absoluteExpiry.toString());
            return data.access_token;
        }
    } catch (e) { return null; }
}

async function runMiniScan() {
    if (isScanning) return;
    
    const liveDisplay = document.getElementById('total-v-live');
    const viewerDisplay = document.getElementById('total-v-viewers');
    const refreshDot = document.getElementById('refresh-indicator'); // Cible la diode verte
    
    if (!liveDisplay || !viewerDisplay) return;

    isScanning = true;

    try {
        const token = await getTwitchToken();
        if (!token) { isScanning = false; return; }

        let totalViewers = 0;
        const seenIDs = new Set();
        let cursor = "";
        const MAX_PAGES = 11;

        for (let i = 0; i < MAX_PAGES; i++) {
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}&_sig=${Date.now()}`;
            const response = await fetch(url, { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } });
            const result = await response.json();
            if (!result.data || result.data.length === 0) break;

            result.data.forEach(stream => {
                const tagsString = (stream.tags || []).join(' ').toLowerCase();
                const titleString = (stream.title || "").toLowerCase();
                const isVTuber = tagsString.includes('vtuber') || titleString.includes('vtuber');

                if (isVTuber && !seenIDs.has(stream.user_id)) {
                    seenIDs.add(stream.user_id);
                    totalViewers += stream.viewer_count;
                }
            });
            cursor = result.pagination.cursor;
            if (!cursor) break;
        }

        const currentLive = parseInt(liveDisplay.innerText.replace(/\s/g, '')) || 0;
        const currentViewers = parseInt(viewerDisplay.innerText.replace(/\s/g, '')) || 0;

        animateValue("total-v-live", currentLive, seenIDs.size, 1500);
        animateValue("total-v-viewers", currentViewers, totalViewers, 1500);

        const updateText = document.getElementById('last-update-text');
        if (updateText) {
            const now = new Date();
            // Formate l'heure en 14:32:05 (HH:mm:ss)
            const timeString = now.toLocaleTimeString('fr-FR', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit' 
            });
            updateText.innerText = `Dernière mise à jour : ${timeString}`;
        }
        // --- PETITE ANIMATION DE LA DIODE VERTE ---
        if (refreshDot) {
            refreshDot.classList.add('active');
            setTimeout(() => {
                refreshDot.classList.remove('active');
            }, 1000); // Reste allumée 1 seconde après le scan
        }

    } catch (err) { 
        console.error("Stats error:", err);
    } finally {
        isScanning = false;
    }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj || start === end) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}