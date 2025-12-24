// Configuration
let isScanningClips = false;

document.addEventListener('DOMContentLoaded', () => {
    loadCommunityClips();
});

async function loadCommunityClips() {
    if (isScanningClips) return;
    isScanningClips = true;

    const container = document.getElementById('clips-container');
    container.innerHTML = `
        <div style="text-align:center; grid-column: 1/-1; padding: 50px;">
            <div class="loader-vcore"></div>
            <p>Scan de la communauté VTubingFR... <br> <small>Récupération des clips des VTubers en live</small></p>
        </div>
    `;

    try {
        const token = await getTwitchToken();
        if (!token) return;

        let vtuberIds = [];
        let cursor = "";
        
        // Scan des lives pour trouver les VTubers
        for (let i = 0; i < 2; i++) {
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const res = await fetch(url, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            if (!data.data) break;

            data.data.forEach(s => {
                const isVT = (s.tags && s.tags.some(t => t.toLowerCase().includes('vtuber'))) || 
                             (s.title && s.title.toLowerCase().includes('vtuber'));
                if (isVT) vtuberIds.push(s.user_id);
            });
            cursor = data.pagination.cursor;
            if (!cursor) break;
        }

        if (vtuberIds.length === 0) {
            container.innerHTML = "<p>Aucun VTuber FR détecté en live pour le moment.</p>";
            return;
        }

        const topVtubers = vtuberIds.slice(0, 15); 
        let allClips = [];

        for (const userId of topVtubers) {
            const clipUrl = `https://api.twitch.tv/helix/clips?broadcaster_id=${userId}&first=3`; 
            const clipRes = await fetch(clipUrl, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const clipData = await clipRes.json();
            if (clipData.data) allClips.push(...clipData.data);
        }

        const finalUserIds = [...new Set(allClips.map(c => c.broadcaster_id))];
        const usersRes = await fetch(`https://api.twitch.tv/helix/users?id=${finalUserIds.join('&id=')}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const usersData = await usersRes.json();
        const profilePics = {};
        usersData.data.forEach(u => profilePics[u.id] = u.profile_image_url);

        allClips.sort((a, b) => b.view_count - a.view_count);

        renderClips(allClips, profilePics);

    } catch (err) {
        console.error("Erreur Scan Clips:", err);
        container.innerHTML = "<p>Désolé, impossible de charger les clips.</p>";
    } finally {
        isScanningClips = false;
    }
}

function renderClips(clips, profilePics) {
    const container = document.getElementById('clips-container');
    container.innerHTML = "";

    clips.forEach(clip => {
        const card = document.createElement('div');
        card.className = 'stream-card clip-card-custom'; 
        
        // --- CRUCIAL POUR LES FILTRES ---
        // On ajoute les data-attributes que ton script.js utilise pour filtrer
        card.setAttribute('data-name', clip.broadcaster_name.toLowerCase());
        card.setAttribute('data-title', clip.title.toLowerCase());
        card.setAttribute('data-category', clip.game_id || 'all'); 
        // -------------------------------

        const pfp = profilePics[clip.broadcaster_id] || "https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png";

        card.innerHTML = `
            <div class="card-header">
                <div class="streamer-info">
                    <img src="${pfp}" class="streamer-pfp">
                    <div class="streamer-details">
                        <span class="streamer-name">${clip.broadcaster_name}</span>
                        <span class="stream-status">🎬 CLIP</span>
                    </div>
                </div>
            </div>

            <div class="thumbnail-container" onclick="openClip('${clip.id}')">
                <img src="${clip.thumbnail_url}" class="stream-thumbnail">
                <div class="viewer-count">👀 ${clip.view_count.toLocaleString()}</div>
                <div class="stream-duration">${Math.floor(clip.duration)}s</div>
                <div class="play-btn-overlay">▶</div>
            </div>

            <div class="card-body">
                <h3 class="stream-title" title="${clip.title}">${clip.title}</h3>
                <div class="stream-tags">
                    <span class="tag">#VTuberFR</span>
                    <span class="tag">#Pépite</span>
                </div>
            </div>
        `;
        container.appendChild(card);
    });

    // --- CRUCIAL ---
    // On relance la fonction de filtrage de script.js pour appliquer les filtres actuels aux nouveaux clips
    if (typeof filterAndDisplay === 'function') {
        filterAndDisplay();
    }
}

function openClip(clipId) {
    const modal = document.getElementById('clip-modal');
    const wrapper = document.getElementById('video-wrapper');
    const domain = window.location.hostname;

    wrapper.innerHTML = `
        <iframe 
            src="https://clips.twitch.tv/embed?clip=${clipId}&parent=${domain || 'localhost'}&autoplay=true" 
            height="100%" 
            width="100%" 
            style="border:none;"
            allowfullscreen="true">
        </iframe>`;
    
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; 
}

function closeClip() {
    const modal = document.getElementById('clip-modal');
    const wrapper = document.getElementById('video-wrapper');
    if(wrapper) wrapper.innerHTML = ""; 
    if(modal) modal.style.display = 'none';
    document.body.style.overflow = 'auto';
}