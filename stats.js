window.addEventListener('load', () => {
    runMiniScan();
    setInterval(runMiniScan, 30000); 
});

// stats.js
async function runMiniScan() {
    try {
        // Utilise les mêmes données que la page découverte !
        const vtubers = await TwitchAPI.getVTubers();
        
        const totalViewers = vtubers.reduce((acc, v) => acc + v.viewer_count, 0);
        
        // Tes animations de chiffres
        animateValue("total-v-live", 0, vtubers.length, 1500);
        animateValue("total-v-viewers", 0, totalViewers, 1500);
    } catch (err) {
        console.error("Erreur stats:", err);
    }
}
function updateUI(vtubers) {
    const totalViewers = vtubers.reduce((acc, v) => acc + v.viewer_count, 0);
    const currentLive = vtubers.length;
    animateValue("total-v-live", 0, currentLive, 1500);
    animateValue("total-v-viewers", 0, totalViewers, 1500);
}

function animateValue(id, start, end, duration) {
    const obj = document.getElementById(id);
    if (!obj) return;
    if (start === end) {
        obj.innerHTML = end.toLocaleString();
        return;
    }
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerHTML = Math.floor(progress * (end - start) + start).toLocaleString();
        if (progress < 1) window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
}