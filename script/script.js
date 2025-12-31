const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';
const STORAGE_KEY = 'vcore_favorites';

let allCachedVTubers = []; 
let filteredVTubers = [];  
let selectedVTubers = []; 
let viewerUpdateInterval = null;

// Pagination locale
let currentPage = 1;
const itemsPerPage = 20;

// --- INITIALISATION UNIQUE ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Appliquer le thème sauvegardé immédiatement
    const savedTheme = localStorage.getItem('vcore-theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = savedTheme;

    // 2. Initialiser les icônes Lucide
    if (window.lucide) lucide.createIcons();

    // 3. Gestionnaire de cycle de thème (Bouton)
    const themeBtn = document.getElementById('theme-cycle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const themes = ['default', 'dark-purist', 'white-light'];
            let current = document.documentElement.getAttribute('data-theme') || 'default';
            let nextTheme = themes[(themes.indexOf(current) + 1) % themes.length];
            changeTheme(nextTheme);
        });
    }

    // 4. Lancer le scan si on est sur la page finder
    if (document.getElementById('vtuber-grid')) {
        startScan();
    }
});

// --- THEME ---
function changeTheme(themeName) {
    document.documentElement.setAttribute('data-theme', themeName);
    localStorage.setItem('vcore-theme', themeName);
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) themeSelect.value = themeName;
}

// --- FAVORIS ---
function getFavorites() {
    const favs = localStorage.getItem(STORAGE_KEY);
    return favs ? JSON.parse(favs) : [];
}

function toggleFavorite(login) {
    let favs = getFavorites();
    if (favs.includes(login)) {
        favs = favs.filter(f => f !== login);
    } else {
        favs.push(login);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favs));
    filterAndDisplay(); 
}

// --- UTILITAIRES ---
function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

function getOptimizedThumb(url, w = 440, h = 248) {
    if (!url) return "";
    return url.replace('{width}', w).replace('{height}', h);
}

// --- AUTHENTIFICATION ---
async function getTwitchToken() {
    const savedToken = localStorage.getItem('twitch_app_token');
    if (savedToken) return savedToken;

    const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&grant_type=client_credentials`, {
        method: 'POST'
    });
    const data = await res.json();
    localStorage.setItem('twitch_app_token', data.access_token);
    return data.access_token;
}

// --- LOGIQUE DE SCAN ---
async function startScan() {
    const status = document.getElementById('status');
    const btn = document.getElementById('refresh-btn');
    
    if (btn) { btn.disabled = true; btn.innerText = "🔄 Scan..."; }
    if (status) status.innerHTML = "⏳ Initialisation...";

    try {
        const token = await getTwitchToken();
        allCachedVTubers = [];
        const seenIDs = new Set();
        let cursor = "";
        const MAX_PAGES = 11; 
        
        for (let i = 0; i < MAX_PAGES; i++) {
            if (status) status.innerText = `🔍 Scan page ${i + 1}/${MAX_PAGES}...`;
            
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, { 
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } 
            });

            const result = await response.json();
            if (!result.data || result.data.length === 0) break;

            const pageMatches = result.data.filter(stream => {
                const hasTag = stream.tags && stream.tags.some(t => t.toLowerCase().includes('vtuber'));
                if (hasTag && !seenIDs.has(stream.user_id)) {
                    seenIDs.add(stream.user_id);
                    return true;
                }
                return false;
            });

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

        if (status) status.innerHTML = `✅ <strong>${allCachedVTubers.length}</strong> VTubers en live.`;
        displayVCoreSpotlight(allCachedVTubers); 
        updateCategoryMenu(allCachedVTubers);
        filterAndDisplay(); 

    } catch (error) {
        console.error(error);
        if (status) status.innerHTML = `<span style="color: #ff4f4f;">❌ Erreur scan</span>`;
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = "🔄 Actualiser"; }
    }
}

// --- AFFICHAGE ---
function filterAndDisplay() {
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;

    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const selectedCategory = document.getElementById('category-filter')?.value || "all";
    const sortBy = document.getElementById('sort-filter')?.value || "viewers-desc"; 
    const favList = getFavorites();

    let allFiltered = allCachedVTubers.filter(s => {
        const matchesSearch = s.user_name.toLowerCase().includes(searchTerm) || (s.title && s.title.toLowerCase().includes(searchTerm));
        const matchesCategory = (selectedCategory === "all") || (s.game_name === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    allFiltered.sort((a, b) => {
        switch (sortBy) {
            case 'viewers-desc': return b.viewer_count - a.viewer_count;
            case 'viewers-asc': return a.viewer_count - b.viewer_count;
            case 'duration-desc': return new Date(a.started_at) - new Date(b.started_at);
            case 'duration-asc': return new Date(b.started_at) - new Date(a.started_at);
            default: return 0;
        }
    });

    const favorites = allFiltered.filter(v => favList.includes(v.user_login));
    const others = allFiltered.filter(v => !favList.includes(v.user_login));

    grid.innerHTML = '';

    if (favorites.length > 0) {
        const titleFav = document.createElement('div');
        titleFav.className = 'fav-section-title';
        titleFav.innerHTML = `⭐ Favoris (${favorites.length})`;
        grid.appendChild(titleFav);
        favorites.forEach(v => grid.appendChild(createCardElement(v)));
    }

    if (others.length > 0) {
        const titleOthers = document.createElement('div');
        titleOthers.className = 'fav-section-title';
        titleOthers.innerHTML = `📡 Tous les Streams (${others.length})`;
        grid.appendChild(titleOthers);
        filteredVTubers = others; 
    } else {
        filteredVTubers = [];
    }

    currentPage = 1;
    loadMoreItems(); 
    setupInfiniteScroll();
}

function loadMoreItems() {
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageItems = filteredVTubers.slice(start, end);

    pageItems.forEach(stream => {
        grid.appendChild(createCardElement(stream));
    });
    currentPage++;
}

function createCardElement(stream) {
    const card = document.createElement('div');
    card.className = 'card';
    const isFav = getFavorites().includes(stream.user_login);
    const isSelected = selectedVTubers.includes(stream.user_login);
    
    const uptimeStr = (() => {
        const diff = new Date() - new Date(stream.started_at);
        return `${Math.floor(diff / 3600000)}h ${Math.floor((diff % 3600000) / 60000)}m`;
    })();

    const tagsHtml = (stream.tags || []).slice(0, 3).map(tag => {
        let sc = tag.toLowerCase().includes("fr") ? "tag-fr" : tag.toLowerCase().includes("asmr") ? "tag-asmr" : "";
        return `<span class="tag-badge ${sc}">${tag}</span>`;
    }).join('');

    card.innerHTML = `
        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${stream.user_login}')">★</button>
        <div class="multistream-selector" onclick="event.stopPropagation();">
            <input type="checkbox" id="ms-${stream.user_login}" ${isSelected ? 'checked' : ''} onchange="toggleVTuberSelection(event, '${stream.user_login}')">
            <label for="ms-${stream.user_login}">Multistream</label>
        </div>
        <div class="card-click-area">
            <div class="thumbnail-wrapper">
                <div class="preview-container" id="preview-${stream.user_login}"></div>
                <img src="${getOptimizedThumb(stream.thumbnail_url)}" class="thumbnail" loading="lazy">
                <span class="viewer-tag">🔴 ${stream.viewer_count.toLocaleString()}</span>
                <span class="uptime-tag">⏳ ${uptimeStr}</span>
            </div>
            <div class="info">
                <img src="${stream.profile_image_url}" class="mini-pfp" onerror="this.src='https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png'" loading="lazy">
                <div class="stream-details">
                    <p class="streamer-name">${stream.user_name}</p>
                    <span class="game-name">${stream.game_name}</span>
                    <div class="tags-container">${tagsHtml}</div>
                    <p class="stream-title">${stream.title}</p>
                </div>
            </div>
        </div>
    `;

    const clickArea = card.querySelector('.card-click-area');
    clickArea.onmouseenter = () => {
        const pb = document.getElementById(`preview-${stream.user_login}`);
        if (pb && !pb.innerHTML) pb.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${stream.user_login}&parent=${window.location.hostname}&muted=true&autoplay=true&controls=false" height="100%" width="100%" frameborder="0"></iframe>`;
    };
    clickArea.onmouseleave = () => {
        const pb = document.getElementById(`preview-${stream.user_login}`);
        if (pb) pb.innerHTML = "";
    };

    clickArea.onclick = () => openPlayer(stream.user_login, stream.viewer_count, stream.user_id, stream.profile_image_url);
    return card;
}

// --- MULTISTREAM ---
function toggleVTuberSelection(event, login) {
    if (event.target.checked) {
        if (selectedVTubers.length >= 3) {
            alert("Maximum 3 VTubers !");
            event.target.checked = false;
            return;
        }
        selectedVTubers.push(login);
    } else {
        selectedVTubers = selectedVTubers.filter(item => item !== login);
    }
    updateMultistreamBar();
}

function updateMultistreamBar() {
    let bar = document.getElementById('multistream-bar') || (()=>{
        const b = document.createElement('div'); b.id = 'multistream-bar';
        document.body.appendChild(b); return b;
    })();

    let lastMultistream = JSON.parse(localStorage.getItem('vcore_last_multistream')) || [];

    if (selectedVTubers.length > 0) {
        bar.classList.add('visible');
        const launchBtn = selectedVTubers.length >= 2 
            ? `<button class="launch-btn" onclick="launchMultistream()">Lancer la Collab (${selectedVTubers.length}) →</button>` 
            : `<span style="font-size:0.8rem; opacity:0.8;">(Encore ${2 - selectedVTubers.length} VTuber)</span>`;
        
        bar.innerHTML = `<div class="bar-content">
            <button class="clear-btn" onclick="clearMultistreamSelection()">✕</button>
            <span>🚀 Multistream : <strong>${selectedVTubers.join(' + ')}</strong></span>
            ${launchBtn}
        </div>`;
    } else if (lastMultistream.length >= 2) {
        bar.classList.add('visible');
        bar.innerHTML = `<div class="bar-content history-mode">
            <span style="opacity: 0.7;">Dernier groupe :</span>
            <button class="history-btn" onclick="launchHistoryMultistream()">⚡ ${lastMultistream.join(' + ')}</button>
            <button class="clear-btn" onclick="clearHistory()">✕</button>
        </div>`;
    } else {
        bar.classList.remove('visible');
    }
}

function clearMultistreamSelection() {
    selectedVTubers = [];
    document.querySelectorAll('.multistream-selector input').forEach(cb => cb.checked = false);
    updateMultistreamBar();
}

function launchMultistream() {
    localStorage.setItem('vcore_last_multistream', JSON.stringify(selectedVTubers));
    window.open(`multistream.html?streams=${selectedVTubers.join(',')}`, '_blank');
}

function launchHistoryMultistream() {
    const last = JSON.parse(localStorage.getItem('vcore_last_multistream'));
    window.open(`multistream.html?streams=${last.join(',')}`, '_blank');
}

function clearHistory() {
    localStorage.removeItem('vcore_last_multistream');
    updateMultistreamBar();
}

// --- PLAYER ---
async function openPlayer(login, viewers, userId, pfpUrl) {
    const theater = document.getElementById('theater-view');
    const domain = window.location.hostname;
    window.location.hash = login;
    
    document.getElementById('theater-viewer-count').innerText = `🔴 ${viewers.toLocaleString()}`;
    document.getElementById('theater-title').innerText = login;
    if (pfpUrl) document.getElementById('streamer-pfp').src = pfpUrl;

    document.getElementById('video-wrapper').innerHTML = `<iframe src="https://player.twitch.tv/?channel=${login}&parent=${domain}&autoplay=true" height="100%" width="100%" allowfullscreen></iframe>`;
    document.getElementById('chat-wrapper').innerHTML = `<iframe src="https://www.twitch.tv/embed/${login}/chat?parent=${domain}&darkpopout" height="100%" width="100%"></iframe>`;
    
    theater.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    
    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    viewerUpdateInterval = setInterval(() => refreshViewerCount(login), 30000);
    fetchExtraDetails(login, userId);
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
            document.getElementById('streamer-bio').innerText = user.description || "Aucune bio.";
            
            const followRes = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${userId || user.id}`, {
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
            });
            const fData = await followRes.json();
            document.getElementById('streamer-followers').innerText = `${fData.total.toLocaleString()} followers`;
        }
    } catch (err) { console.error(err); }
}

function closePlayer(updateUrl = true) {
    if (viewerUpdateInterval) clearInterval(viewerUpdateInterval);
    document.getElementById('theater-view').classList.add('hidden');
    document.getElementById('video-wrapper').innerHTML = '';
    document.getElementById('chat-wrapper').innerHTML = '';
    document.body.style.overflow = 'auto';
    if (updateUrl) history.pushState("", document.title, window.location.pathname);
}

// --- AUTRES FONCTIONS ---
function setupInfiniteScroll() {
    const old = document.getElementById('scroll-sentinel');
    if (old) old.remove();
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    grid.after(sentinel);
    new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && (currentPage - 1) * itemsPerPage < filteredVTubers.length) loadMoreItems();
    }).observe(sentinel);
}

function updateCategoryMenu(vtubers) {
    const menu = document.getElementById('category-filter');
    if (!menu) return;
    const cats = [...new Set(vtubers.map(v => v.game_name))].filter(Boolean).sort();
    menu.innerHTML = '<option value="all">Toutes les catégories</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

async function refreshViewerCount(login) {
    const token = await getTwitchToken();
    const res = await fetch(`https://api.twitch.tv/helix/streams?user_login=${login}`, {
        headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.data?.[0]) document.getElementById('theater-viewer-count').innerText = `🔴 ${data.data[0].viewer_count.toLocaleString()}`;
}

function displayVCoreSpotlight(streams) {
    const container = document.getElementById('vtuber-spotlight');
    if (!container || !streams.length) return;
    const small = streams.filter(s => s.viewer_count > 0 && s.viewer_count <= 25);
    if (!small.length) { container.style.display = 'none'; return; }
    const lucky = small[Math.floor(Math.random() * small.length)];
    container.innerHTML = `
        <div class="spotlight-card" onclick="openPlayer('${lucky.user_login}', ${lucky.viewer_count}, '${lucky.user_id}', '${lucky.profile_image_url}')">
            <div class="spotlight-badge">✨ Coup de Projecteur</div>
            <div class="spotlight-content">
                <img src="${getOptimizedThumb(lucky.thumbnail_url, 600, 337)}" class="spotlight-img">
                <div class="spotlight-info">
                    <div class="spotlight-header">
                        <img src="${lucky.profile_image_url}" class="spotlight-pfp">
                        <div><h3>${lucky.user_name}</h3><span>🔴 ${lucky.viewer_count} viewers</span></div>
                    </div>
                    <p class="spotlight-title">${lucky.title}</p>
                    <div class="spotlight-game">${lucky.game_name}</div>
                </div>
            </div>
        </div>`;
    container.style.display = 'block';
}

function exportConfig() {
    const data = { favorites: getFavorites(), date: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = "vcore_config.json"; a.click();
}

function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const config = JSON.parse(e.target.result);
        if (config.favorites) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(config.favorites));
            filterAndDisplay();
            alert("✅ Import réussi !");
        }
    };
    reader.readAsText(file);
}