const CLIENT_ID = '';
const CLIENT_SECRET = '';

let allCachedVTubers = [];
let viewerUpdateInterval = null;

async function getTwitchToken() {
    try {
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, {
            method: 'POST'
        });
        const data = await response.json();
        return data.access_token;
    } catch (error) {
        console.error("❌ Erreur token", error);
    }
}

async function startScan() {
    const status = document.getElementById('status');
    const btn = document.getElementById('refresh-btn');
    const grid = document.getElementById('vtuber-grid');
    
    btn.disabled = true;
    grid.innerHTML = '';
    allCachedVTubers = [];
    
    // --- ANTI DOUBLONS ---
    // On utilise un Set pour stocker les ID des streamers déjà trouvés
    const seenIDs = new Set();

    const token = await getTwitchToken();
    if (!token) return;

    let cursor = "";
    let totalScanned = 0;
    const MAX_PAGES = 50; 

    try {
        for (let i = 0; i < MAX_PAGES; i++) {
            status.innerText = `Scan page ${i + 1}/${MAX_PAGES}...`;
            
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } });
            const result = await response.json();

            if (!result.data || result.data.length === 0) break;
            totalScanned += result.data.length;

            const pageMatches = result.data.filter(stream => {
                if (!stream.tags) return false;
                
                // Vérification du tag
                const hasTag = stream.tags.some(t => t.toLowerCase() === 'vtuberfr');
                
                // Vérification anti-doublon
                if (hasTag && !seenIDs.has(stream.user_id)) {
                    seenIDs.add(stream.user_id); // On l'ajoute à la liste des connus
                    return true;
                }
                return false;
            });

            allCachedVTubers = [...allCachedVTubers, ...pageMatches];
            cursor = result.pagination.cursor;
            if (!cursor) break;
        }

        status.innerText = `✅ Terminé : ${allCachedVTubers.length} VTubers uniques trouvés.`;
        displayStreams(allCachedVTubers);

    } catch (error) {
        console.error(error);
        status.innerText = "Erreur pendant le scan.";
    } finally {
        btn.disabled = false;
        btn.innerText = "🔄 Actualiser la liste";
    }
}

// --- FONCTION DE PARTAGE ---
function copyLiveLink() {
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl).then(() => {
        const status = document.getElementById('share-status');
        status.style.display = 'inline';
        setTimeout(() => { status.style.display = 'none'; }, 2000);
    });
}

// --- MISE À JOUR DU COMPTEUR EN DIRECT ---
async function refreshViewerCount(login) {
    const token = await getTwitchToken();
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const viewerDisplay = document.getElementById('theater-viewer-count');
        
        if (data.data && data.data[0]) {
            const count = data.data[0].viewer_count;
            viewerDisplay.innerText = `🔴 ${count.toLocaleString()}`;
        } else {
            viewerDisplay.innerText = `🔴 Hors-ligne`;
        }
    } catch (err) {
        console.error("Erreur refresh viewers:", err);
    }
}

function displayStreams(vtubers) {
    const grid = document.getElementById('vtuber-grid');
    grid.innerHTML = '';
    
    if (vtubers.length === 0) {
        grid.innerHTML = '<p style="text-align:center;">Aucun résultat.</p>';
        return;
    }

    vtubers.sort((a, b) => b.viewer_count - a.viewer_count);

    vtubers.forEach(stream => {
        const card = document.createElement('div');
        card.className = 'card';
        // Au clic, on appelle openPlayer avec le pseudo du streamer
        card.onclick = () => openPlayer(stream.user_login, stream.viewer_count);
        
        const thumbUrl = stream.thumbnail_url.replace('{width}', '400').replace('{height}', '225') + `?t=${Date.now()}`;

        card.innerHTML = `
            <div style="position:relative;">
                <img src="${thumbUrl}" class="thumbnail">
                <span style="position:absolute; bottom:10px; right:10px; background:rgba(0,0,0,0.8); padding:2px 6px; border-radius:4px; font-size:12px;">🔴 ${stream.viewer_count}</span>
            </div>
            <div class="info">
                <h3 style="margin:0 0 5px; color:#bf94ff;">${stream.user_name}</h3>
                <p style="color:#adadb8; font-size:0.8rem; margin:0;">${stream.game_name}</p>
                <p style="font-size:0.85rem; height:2.4em; overflow:hidden;">${stream.title}</p>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- GESTION DE L'URL ET NAVIGATION ---

// 1. Détecte si un nom est présent dans l'URL au chargement
window.addEventListener('load', () => {
    const channelFromUrl = window.location.hash.replace('#', '');
    if (channelFromUrl) {
        openPlayer(channelFromUrl, 0); // On ouvre le lecteur, viewers à 0 par défaut
    }
});

// 2. Détecte quand l'utilisateur clique sur "Précédent" dans son navigateur
window.addEventListener('hashchange', () => {
    const channelFromUrl = window.location.hash.replace('#', '');
    if (!channelFromUrl) {
        closePlayer(false); // Ferme sans modifier l'URL (car déjà vide)
    } else {
        openPlayer(channelFromUrl, 0);
    }
});

async function openPlayer(channelLogin, viewerCount = 0) {
    const theater = document.getElementById('theater-view');
    const videoContainer = document.getElementById('video-wrapper');
    const chatContainer = document.getElementById('chat-wrapper');
    const viewerDisplay = document.getElementById('theater-viewer-count');
    const parentDomain = window.location.hostname; 

    // Mise à jour de l'URL sans recharger la page
    window.location.hash = channelLogin;

    viewerDisplay.innerText = `🔴 ${viewerCount.toLocaleString()}`;

    videoContainer.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${channelLogin}&parent=${parentDomain}&autoplay=true" height="100%" width="100%" allowfullscreen></iframe>`;
    chatContainer.innerHTML = `<iframe src="https://www.twitch.tv/embed/${channelLogin}/chat?parent=${parentDomain}&darkpopout" height="100%" width="100%"></iframe>`;

    theater.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    viewerUpdateInterval = setInterval(() => refreshViewerCount(channelLogin), 60000);
    
    // Premier appel immédiat pour être à jour
    refreshViewerCount(channelLogin);
    
    // Mettre à jour l'URL
    window.location.hash = channelLogin;

    fetchExtraDetails(channelLogin);
}

// --- FERMETURE OPTIMISÉE ---
function closePlayer(updateUrl = true) {
    // 1. Arrêter le timer des viewers
    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    
    // 2. Cacher le lecteur
    const theater = document.getElementById('theater-view');
    theater.classList.add('hidden');
    
    // 3. Vider les iframes pour stopper le son immédiatement
    document.getElementById('video-wrapper').innerHTML = '';
    document.getElementById('chat-wrapper').innerHTML = '';
    
    // 4. Réactiver le scroll de la grille
    document.body.style.overflow = 'auto';

    // 5. Nettoyer l'URL
    if (updateUrl) {
        history.pushState("", document.title, window.location.pathname + window.location.search);
    }
    
    // NOTE : On ne touche PAS à allCachedVTubers ni à la grille, 
    // donc tout est encore là quand le lecteur se ferme !
}

async function fetchExtraDetails(login) {
    const token = await getTwitchToken();
    
    try {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        const user = userData.data[0];

        // --- MISE À JOUR DU LIEN TWITCH ---
        const streamerLink = document.getElementById('streamer-link');
        streamerLink.href = `https://twitch.tv/${login}`;
        
        document.getElementById('streamer-name').innerText = user.display_name;
        document.getElementById('streamer-pfp').src = user.profile_image_url;
        document.getElementById('streamer-bio').innerText = user.description || "Aucune biographie disponible.";
        
        // Followers...
        const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${user.id}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const followData = await followRes.json();
        document.getElementById('streamer-followers').innerText = `${followData.total.toLocaleString()} followers`;

    } catch (err) {
        console.error("Erreur détails:", err);
    }
}

// Recherche locale
document.getElementById('search-input').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allCachedVTubers.filter(s => 
        s.user_name.toLowerCase().includes(term) || s.title.toLowerCase().includes(term)
    );
    displayStreams(filtered);
});