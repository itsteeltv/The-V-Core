let isScanning = false;

// On utilise DOMContentLoaded pour s'assurer que le HTML est prêt
window.addEventListener('DOMContentLoaded', () => {
    // Petit délai de sécurité pour laisser script.js s'initialiser
    setTimeout(() => {
        runMiniScan();
        setInterval(runMiniScan, 60000); 
    }, 1500);
});

async function runMiniScan() {
    // Vérification de sécurité pour éviter les erreurs de console
    if (isScanning) return;
    if (typeof CLIENT_ID === 'undefined' || typeof getTwitchToken !== 'function') {
        console.warn("Stats.js : En attente des dépendances (CLIENT_ID ou getTwitchToken)...");
        return;
    }
    
    const liveDisplay = document.getElementById('total-v-live');
    const viewerDisplay = document.getElementById('total-v-viewers');
    if (!liveDisplay || !viewerDisplay) return;

    isScanning = true;

    try {
        const token = await getTwitchToken();
        if (!token) return;

        let totalViewers = 0;
        let vtubersCount = 0;
        let cursor = "";
        
        // Scan de 5 pages (500 streams) est généralement suffisant pour les stats FR
        for (let i = 0; i < 5; i++) {
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, { 
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } 
            });
            
            const result = await response.json();
            if (!result.data || result.data.length === 0) break;

            result.data.forEach(stream => {
                const isVTuber = (stream.tags && stream.tags.some(t => t.toLowerCase().includes('vtuber'))) || 
                                 (stream.title && stream.title.toLowerCase().includes('vtuber'));
                if (isVTuber) {
                    vtubersCount++;
                    totalViewers += stream.viewer_count;
                }
            });

            cursor = result.pagination?.cursor;
            if (!cursor) break;
        }

        // Animation fluide
        const currentLive = parseInt(liveDisplay.innerText.replace(/\s/g, '')) || 0;
        const currentViewers = parseInt(viewerDisplay.innerText.replace(/\s/g, '')) || 0;

        animateValue("total-v-live", currentLive, vtubersCount, 1500);
        animateValue("total-v-viewers", currentViewers, totalViewers, 1500);

        // Update UI
        document.getElementById('last-update-text') && (document.getElementById('last-update-text').innerText = `Dernière mise à jour : ${new Date().toLocaleTimeString('fr-FR')}`);
        
        const dot = document.getElementById('refresh-indicator');
        if (dot) {
            dot.classList.add('active');
            setTimeout(() => dot.classList.remove('active'), 2000);
        }

    } catch (err) {
        console.error("Stats Error:", err);
    } finally {
        isScanning = false;
    }
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString('fr-FR');
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}