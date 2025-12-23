let allCachedVTubers = []; 
let filteredVTubers = [];  
let selectedVTubers = []; // Pour le V-Multistream
let favoriteVTubers = JSON.parse(localStorage.getItem('vcore_favorites')) || []; // Système de favoris
let viewerUpdateInterval = null;

// --- CONFIGURATION DU CACHE ---
const CACHE_KEY = 'vcore_finder_cache';
const CACHE_TIME_KEY = 'vcore_finder_timestamp';
const CACHE_DURATION = 3 * 60 * 1000; 

// Pagination locale
let currentPage = 1;
const itemsPerPage = 20;

// --- UTILITAIRES ---
function getOptimizedThumb(url, w = 440, h = 248) {
    return url.replace('{width}', w).replace('{height}', h);
}

// --- INITIALISATION ---
window.addEventListener('load', () => {
    startScan();
    const urlParams = new URLSearchParams(window.location.search);
    const searchFromUrl = urlParams.get('search');
    
    setInterval(() => {
        const theater = document.getElementById('theater-view');
        if (theater && theater.classList.contains('hidden')) {
            startScan();
        }
    }, 60000);

    const searchInput = document.getElementById('search-input');
    if (searchFromUrl && searchInput) {
        searchInput.value = searchFromUrl; 
    }
});

// --- GESTION DES FAVORIS ---
function toggleFavorite(userId, event) {
    if (event) event.stopPropagation(); 
    
    const index = favoriteVTubers.indexOf(userId);
    if (index === -1) {
        favoriteVTubers.push(userId);
    } else {
        favoriteVTubers.splice(index, 1);
    }
    
    localStorage.setItem('vcore_favorites', JSON.stringify(favoriteVTubers));
    filterAndDisplay(); // Rafraîchir pour réorganiser la liste immédiatement
}

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
    const grid = document.getElementById('vtuber-grid');
    // 1. Afficher les Skeletons (Simple version)
    if (grid) grid.innerHTML = '<div class="skeleton-card"></div>'.repeat(8); 
    
    try {
        // Le manager décide lui-même s'il doit appeler Twitch ou utiliser le cache
        allCachedVTubers = await TwitchAPI.getVTubers();
        
        const status = document.getElementById('status');
        if (status) status.innerText = `✅ ${allCachedVTubers.length} VTubers en live`;
        
        filterAndDisplay();
    } catch (error) {
        console.error(error);
        if (grid) grid.innerHTML = `<div class="error-banner">Erreur Twitch. <button onclick="startScan()">Réessayer</button></div>`;
    }
}

// Remplace ta fonction forceRefresh par celle-ci
async function forceRefresh() {
    const btn = document.getElementById('refresh-btn');
    if (btn) btn.innerText = "⏳ Scan...";
    
    allCachedVTubers = await TwitchAPI.getVTubers(true); // Force le bypass du cache
    
    if (btn) btn.innerText = "🔄 Actualiser";
    filterAndDisplay();
}

// --- LOGIQUE D'AFFICHAGE AVEC SÉPARATION FAVORIS ---

function filterAndDisplay() {
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;

    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const selectedCategory = document.getElementById('category-filter')?.value || "all";

    // 1. Filtrage global
    let allFiltered = allCachedVTubers.filter(s => {
        const matchesSearch = s.user_name.toLowerCase().includes(searchTerm) || 
                             (s.title && s.title.toLowerCase().includes(searchTerm));
        const matchesCategory = (selectedCategory === "all") || (s.game_name === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    // 2. Séparation en deux listes
    const favorites = allFiltered.filter(v => favoriteVTubers.includes(v.user_id));
    const others = allFiltered.filter(v => !favoriteVTubers.includes(v.user_id));

    // 3. Vidage de la grille
    grid.innerHTML = '';

    // 4. Affichage des favoris
    if (favorites.length > 0) {
        const titleFav = document.createElement('div');
        titleFav.className = 'fav-section-title';
        titleFav.innerHTML = `⭐ Mes Favoris en Live (${favorites.length})`;
        grid.appendChild(titleFav);

        favorites.forEach(v => grid.appendChild(createCardElement(v)));
    }

    // 5. Affichage du reste
    if (others.length > 0) {
        const titleOthers = document.createElement('div');
        titleOthers.className = 'fav-section-title';
        titleOthers.innerHTML = `📡 Tous les Streams (${others.length})`;
        grid.appendChild(titleOthers);

        // On définit filteredVTubers sur "others" pour que loadMoreItems (scroll infini) ne gère que cette liste
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

    initLazyLoading();
    if (window.AOS) AOS.refresh();
    currentPage++;
}

function createCardElement(stream) {
    const card = document.createElement('div');
    card.className = 'card';
    card.setAttribute('data-aos', 'fade-up');
    
    const isFav = favoriteVTubers.includes(stream.user_id);
    const tagsHtml = (stream.tags || []).slice(0, 3).map(tag => `<span class="tag-badge">${tag}</span>`).join('');

    card.innerHTML = `
        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="toggleFavorite('${stream.user_id}', event)" title="Favori">★</button>
        <div class="multistream-selector">
            <input type="checkbox" value="${stream.user_login}" onclick="toggleVTuberSelection(event, '${stream.user_login}')" ${selectedVTubers.includes(stream.user_login) ? 'checked' : ''}>
        </div>
        <div class="card-click-area">
            <div class="thumbnail-wrapper">
                <div class="preview-container" id="preview-${stream.user_login}"></div>
                <img data-src="${getOptimizedThumb(stream.thumbnail_url)}" 
                     src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" 
                     class="thumbnail lazy-img" width="440" height="248">
                <span class="viewer-tag">🔴 ${stream.viewer_count.toLocaleString()}</span>
            </div>
            <div class="info">
                <img data-src="${stream.profile_image_url}" src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=" class="mini-pfp lazy-img" width="50" height="50">
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
    
    clickArea.addEventListener('mouseenter', () => {
        const pb = document.getElementById(`preview-${stream.user_login}`);
        if (pb && pb.innerHTML === "") {
            pb.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${stream.user_login}&parent=${window.location.hostname}&muted=true&autoplay=true&controls=false" height="100%" width="100%" frameborder="0"></iframe>`;
        }
    });
    clickArea.addEventListener('mouseleave', () => {
        const pb = document.getElementById(`preview-${stream.user_login}`);
        if (pb) pb.innerHTML = "";
    });

    clickArea.onclick = () => openPlayer(stream.user_login, stream.viewer_count, stream.user_id, stream.profile_image_url);
    return card;
}

// --- MULTISTREAM ---

function toggleVTuberSelection(event, login) {
    event.stopPropagation();
    const checkbox = event.target;
    if (checkbox.checked) {
        if (selectedVTubers.length >= 3) {
            alert("Maximum 3 VTubers pour le Multistream !");
            checkbox.checked = false;
            return;
        }
        selectedVTubers.push(login);
    } else {
        selectedVTubers = selectedVTubers.filter(item => item !== login);
    }
    updateMultistreamBar();
}

// Variable pour le dernier multistream
let lastMultistream = JSON.parse(localStorage.getItem('vcore_last_multistream')) || [];

function updateMultistreamBar() {
    let bar = document.getElementById('multistream-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'multistream-bar';
        document.body.appendChild(bar);
    }

    if (selectedVTubers.length > 0) {
        bar.classList.add('visible');
        const launchBtn = selectedVTubers.length >= 2 
            ? `<button class="launch-btn" onclick="launchMultistream()">Lancer la Collab (${selectedVTubers.length}) →</button>` 
            : `<span style="font-size:0.8rem; opacity:0.8;">(Sélectionnez encore ${2 - selectedVTubers.length} VTuber)</span>`;
        
        bar.innerHTML = `
            <div class="bar-content">
                <button class="clear-btn" onclick="clearMultistreamSelection()" title="Tout annuler">✕</button>
                <span>🚀 Multistream : <strong>${selectedVTubers.join(' + ')}</strong></span>
                ${launchBtn}
            </div>
        `;
    } else if (lastMultistream.length >= 2) {
        // --- NOUVEAU : Affichage de l'historique si rien n'est sélectionné ---
        bar.classList.add('visible');
        bar.innerHTML = `
            <div class="bar-content history-mode">
                <span style="opacity: 0.7; font-size: 0.85rem;">Dernier groupe :</span>
                <button class="history-btn" onclick="launchHistoryMultistream()">
                    ⚡ ${lastMultistream.join(' + ')}
                </button>
                <button class="clear-btn" onclick="clearHistory()" title="Effacer l'historique">✕</button>
            </div>
        `;
    } else {
        bar.classList.remove('visible');
    }
}

function clearMultistreamSelection() {
    selectedVTubers = [];
    // Décocher toutes les cases dans le DOM
    const checkboxes = document.querySelectorAll('.multistream-selector input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateMultistreamBar();
}

function launchMultistream() {
    // Sauvegarde dans l'historique avant de lancer
    localStorage.setItem('vcore_last_multistream', JSON.stringify(selectedVTubers));
    
    const url = `multistream.html?streams=${selectedVTubers.join(',')}`;
    window.open(url, '_blank');
}

// Fonction pour relancer l'historique
function launchHistoryMultistream() {
    const url = `multistream.html?streams=${lastMultistream.join(',')}`;
    window.open(url, '_blank');
}

// Fonction pour effacer l'historique si l'utilisateur le souhaite
function clearHistory() {
    localStorage.removeItem('vcore_last_multistream');
    lastMultistream = [];
    updateMultistreamBar();
}

function setupInfiniteScroll() {
    const oldSentinel = document.getElementById('scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;
    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    sentinel.style.height = '10px';
    grid.after(sentinel);
    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && (currentPage - 1) * itemsPerPage < filteredVTubers.length) {
            loadMoreItems();
        }
    }, { threshold: 0.1 });
    observer.observe(sentinel);
}

// --- PLAYER ---

async function openPlayer(login, viewers, userId, pfpUrl) {
    const theater = document.getElementById('theater-view');
    const domain = window.location.hostname;
    window.location.hash = login;
    document.getElementById('theater-viewer-count').innerText = `🔴 ${viewers.toLocaleString()}`;
    document.getElementById('theater-title').innerText = login;
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
    const container = document.querySelector('.iframe-container');
    if (container) container.classList.remove('cinema-active');
    theater.classList.add('hidden');
    document.getElementById('video-wrapper').innerHTML = '';
    document.getElementById('chat-wrapper').innerHTML = '';
    document.body.style.overflow = 'auto';
    if (updateUrl) history.pushState("", document.title, window.location.pathname);
}

function toggleCinemaMode() {
    const container = document.querySelector('.iframe-container');
    const btn = document.getElementById('cinema-mode-btn');
    if (!container || !btn) return;
    container.classList.toggle('cinema-active');
    const isMobile = window.innerWidth <= 768;
    btn.innerHTML = container.classList.contains('cinema-active') ? 
        (isMobile ? "📖 Masquer le chat" : "🪟 Afficher le chat") : 
        (isMobile ? "💬 Voir le chat" : "🎬 Mode Cinéma");
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
    } catch (err) { console.error("Erreur détails:", err); }
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
        const vDisplay = document.getElementById('theater-viewer-count');
        if (data.data && data.data[0] && vDisplay) {
            vDisplay.innerText = `🔴 ${data.data[0].viewer_count.toLocaleString()}`;
        }
    } catch (err) { console.error("Refresh Error:", err); }
}

function initLazyLoading() {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img.dataset.src) {
                    img.src = img.dataset.src; // On charge la vraie image
                    img.classList.add('loaded'); // Pour un effet de fondu CSS
                    img.removeAttribute('data-src'); 
                }
                observer.unobserve(img); // On arrête d'observer cette image
            }
        });
    }, { 
        rootMargin: '100px 0px', // Charge l'image 100px avant qu'elle n'apparaisse
        threshold: 0.01 
    });

    document.querySelectorAll('img.lazy-img[data-src]').forEach(img => imageObserver.observe(img));
}