const CLIENT_ID = '';
const CLIENT_SECRET = '';

let allCachedVTubers = [];
let viewerUpdateInterval = null;

// --- INITIALISATION AUTOMATIQUE ---
window.addEventListener('load', () => {
    startScan();
    setInterval(() => {
        const theater = document.getElementById('theater-view');
        if (theater && theater.classList.contains('hidden')) {
            startScan();
        }
    }, 60000);

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', filterAndDisplay);
    }
});

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
    
    if (btn) btn.disabled = true;

    const token = await getTwitchToken();
    if (!token) return;

    allCachedVTubers = [];
    const seenIDs = new Set();
    let cursor = "";
    const MAX_PAGES = 11; 

    try {
        for (let i = 0; i < MAX_PAGES; i++) {
            status.innerText = `Scan page ${i + 1}/${MAX_PAGES}...`;
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, { headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } });
            const result = await response.json();

            if (!result.data || result.data.length === 0) break;

            const pageMatches = result.data.filter(stream => {
                const hasTag = stream.tags && stream.tags.some(t => t.toLowerCase() === 'vtuberfr' || t.toLowerCase() === 'vtuber');
                if (hasTag && !seenIDs.has(stream.user_id)) {
                    seenIDs.add(stream.user_id);
                    return true;
                }
                return false;
            });

            // RÉCUPÉRATION DES AVATARS OFFICIELS
            if (pageMatches.length > 0) {
                const logins = pageMatches.map(s => `login=${s.user_login}`).join('&');
                const userRes = await fetch(`https://api.twitch.tv/helix/users?${logins}`, {
                    headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
                });
                const userData = await userRes.json();
                pageMatches.forEach(s => {
                    const u = userData.data.find(user => user.id === s.user_id);
                    s.profile_image_url = u ? u.profile_image_url : '';
                });
            }

            allCachedVTubers = [...allCachedVTubers, ...pageMatches];
            cursor = result.pagination.cursor;
            if (!cursor) break;
        }

        status.innerText = `✅ ${allCachedVTubers.length} VTubers trouvés.`;
        updateCategoryMenu(allCachedVTubers);
        filterAndDisplay(); 

    } catch (error) {
        console.error(error);
        status.innerText = "Erreur pendant le scan.";
    } finally {
        if (btn) btn.disabled = false;
    }
}

function displayStreams(vtubers) {
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    vtubers.sort((a, b) => b.viewer_count - a.viewer_count).forEach(stream => {
        const card = document.createElement('div');
        card.className = 'card';
        
        card.innerHTML = `
            <div class="thumbnail-wrapper">
                <div class="preview-container" id="preview-${stream.user_login}"></div>
                <img src="${stream.thumbnail_url.replace('{width}', '400').replace('{height}', '225')}" class="thumbnail">
                <span class="viewer-tag">🔴 ${stream.viewer_count.toLocaleString()}</span>
            </div>
            <div class="info">
                <img src="${stream.profile_image_url}" class="mini-pfp" 
                     onerror="this.src='https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png'">
                <div class="stream-details">
                    <p class="streamer-name">${stream.user_name}</p>
                    <span class="game-name">${stream.game_name}</span>
                    <p class="stream-title">${stream.title}</p>
                </div>
            </div>
        `;

        card.addEventListener('mouseenter', () => {
            const previewBox = document.getElementById(`preview-${stream.user_login}`);
            if (previewBox && previewBox.innerHTML === "") {
                previewBox.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${stream.user_login}&parent=${window.location.hostname}&muted=true&autoplay=true&controls=false" height="100%" width="100%" frameborder="0"></iframe>`;
            }
        });

        card.addEventListener('mouseleave', () => {
            const previewBox = document.getElementById(`preview-${stream.user_login}`);
            if (previewBox) previewBox.innerHTML = "";
        });

        card.onclick = () => openPlayer(stream.user_login, stream.viewer_count, stream.user_id, stream.profile_image_url);
        grid.appendChild(card);
    });
}

async function openPlayer(login, viewers, userId, pfpUrl) {
    const theater = document.getElementById('theater-view');
    const domain = window.location.hostname;

    window.location.hash = login;
    document.getElementById('theater-viewer-count').innerText = `🔴 ${viewers.toLocaleString()}`;
    document.getElementById('theater-title').innerText = login;
    
    // Mise à jour immédiate du logo avec celui de la grille
    const pfp = document.getElementById('streamer-pfp');
    if (pfp && pfpUrl) pfp.src = pfpUrl;

    document.getElementById('video-wrapper').innerHTML = `<iframe src="https://player.twitch.tv/?channel=${login}&parent=${domain}&autoplay=true" height="100%" width="100%" allowfullscreen></iframe>`;
    document.getElementById('chat-wrapper').innerHTML = `<iframe src="https://www.twitch.tv/embed/${login}/chat?parent=${domain}&darkpopout" height="100%" width="100%"></iframe>`;

    theater.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    viewerUpdateInterval = setInterval(() => refreshViewerCount(login), 30000);
    
    fetchExtraDetails(login, userId);
}

function closePlayer(updateUrl = true) {
    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    const theater = document.getElementById('theater-view');
    theater.classList.add('hidden');
    
    document.getElementById('video-wrapper').innerHTML = '';
    document.getElementById('chat-wrapper').innerHTML = '';
    document.body.style.overflow = 'auto';

    if (updateUrl) {
        history.pushState("", document.title, window.location.pathname);
    }
}

async function fetchExtraDetails(login, userId) {
    const token = await getTwitchToken();
    try {
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${login}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();
        const user = userData.data[0];

        if (user) {
            document.getElementById('streamer-link').href = `https://twitch.tv/${login}`;
            document.getElementById('streamer-name').innerText = user.display_name;
            document.getElementById('streamer-pfp').src = user.profile_image_url;
            document.getElementById('streamer-bio').innerText = user.description || "Aucune biographie disponible.";
            
            const targetId = userId || user.id;
            const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${targetId}`, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const followData = await followRes.json();
            document.getElementById('streamer-followers').innerText = `${followData.total.toLocaleString()} followers`;
        }
    } catch (err) { console.error("Erreur lors de la récupération des détails:", err); }
}

function filterAndDisplay() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const selectedCategory = document.getElementById('category-filter')?.value || "all";

    const filtered = allCachedVTubers.filter(s => {
        const matchesSearch = s.user_name.toLowerCase().includes(searchTerm) || 
                             (s.title && s.title.toLowerCase().includes(searchTerm));
        const matchesCategory = (selectedCategory === "all") || (s.game_name === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    displayStreams(filtered);
}


function updateCategoryMenu(vtubers) {
    const categoryFilter = document.getElementById('category-filter');
    if (!categoryFilter) return;

    const categories = [...new Set(vtubers.map(v => v.game_name))].filter(Boolean).sort();
    categoryFilter.innerHTML = '<option value="all">Toutes les catégories</option>';
    categories.forEach(cat => {
        const option = document.createElement('option');
        option.value = cat;
        option.textContent = cat;
        categoryFilter.appendChild(option);
    });
}

async function refreshViewerCount(login) {
    const token = await getTwitchToken();
    try {
        const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        const viewerDisplay = document.getElementById('theater-viewer-count');
        if (data.data && data.data[0] && viewerDisplay) {
            viewerDisplay.innerText = `🔴 ${data.data[0].viewer_count.toLocaleString()}`;
        }
    } catch (err) { console.error("Erreur rafraîchissement viewers:", err); }
}