const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';
const STORAGE_KEY = 'vcore_favorites';

let allCachedVTubers = []; 
let filteredVTubers = [];  
let selectedVTubers = []; // Liste des VTubers sélectionnés pour le multistream
let viewerUpdateInterval = null;

// Pagination locale
let currentPage = 1;
const itemsPerPage = 20;

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

// --- INITIALISATION ---
window.addEventListener('load', () => {
    startScan();
    
    setInterval(() => {
        const theater = document.getElementById('theater-view');
        if (theater && theater.classList.contains('hidden')) {
            startScan();
        }
    }, 60000);

    const processChange = debounce(() => filterAndDisplay());
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', processChange);
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

// --- LOGIQUE DE SCAN ---
async function startScan() {
    const status = document.getElementById('status');
    const btn = document.getElementById('refresh-btn');
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = "🔄 Scan en cours...";
    }
    if (status) status.innerHTML = "⏳ Initialisation du scan...";

    try {
        const token = await getTwitchToken();
        if (!token) throw new Error("Impossible de récupérer le jeton Twitch.");
        
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

        if (status) status.innerHTML = `✅ <strong>${allCachedVTubers.length}</strong> VTubers trouvés.`;
        displayVCoreSpotlight(allCachedVTubers); 

        updateCategoryMenu(allCachedVTubers);
        filterAndDisplay(); 

    } catch (error) {
        console.error(error);
        if (status) status.innerHTML = `<span style="color: #ff4f4f;">❌ Erreur lors du scan</span>`;
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "🔄 Actualiser la liste";
        }
    }
}

// --- LOGIQUE D'AFFICHAGE ---
function filterAndDisplay() {
    const grid = document.getElementById('vtuber-grid');
    if (!grid) return;

    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const selectedCategory = document.getElementById('category-filter')?.value || "all";
    
    // On récupère bien "sort-filter" ici
    const sortBy = document.getElementById('sort-filter')?.value || "viewers-desc"; 
    
    const favList = getFavorites();

    // 1. Filtrage global (inchangé)
    let allFiltered = allCachedVTubers.filter(s => {
        const matchesSearch = s.user_name.toLowerCase().includes(searchTerm) || 
                             (s.title && s.title.toLowerCase().includes(searchTerm));
        const matchesCategory = (selectedCategory === "all") || (s.game_name === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    // 2. Application du Tri (vérifie que les 'case' correspondent aux 'value' du HTML)
    allFiltered.sort((a, b) => {
        switch (sortBy) {
            case 'viewers-desc':
                return b.viewer_count - a.viewer_count;
            case 'viewers-asc':
                return a.viewer_count - b.viewer_count;
            case 'duration-desc':
                return new Date(a.started_at) - new Date(b.started_at);
            case 'duration-asc':
                return new Date(b.started_at) - new Date(a.started_at);
            default:
                return 0;
        }
    });

    // 3. Séparation en deux listes
    const favorites = allFiltered.filter(v => favList.includes(v.user_login));
    const others = allFiltered.filter(v => !favList.includes(v.user_login));

    // 4. Vidage et Affichage
    grid.innerHTML = '';

    if (favorites.length > 0) {
        const titleFav = document.createElement('div');
        titleFav.className = 'fav-section-title';
        titleFav.innerHTML = `⭐ Mes Favoris en Live (${favorites.length})`;
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
    const favs = getFavorites();
    const isFav = favs.includes(stream.user_login);
    const isSelected = selectedVTubers.includes(stream.user_login);
    const startTime = new Date(stream.started_at);
    const now = new Date();
    const diffMs = now - startTime;
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffMins = Math.floor((diffMs % 3600000) / 60000);
    const uptimeStr = `${diffHrs}h ${diffMins}m`;

    const tagsHtml = (stream.tags || []).slice(0, 3).map(tag => {
        let specialClass = "";
        if(tag.toLowerCase().includes("fr")) specialClass = "tag-fr";
        if(tag.toLowerCase().includes("asmr")) specialClass = "tag-asmr";
        return `<span class="tag-badge ${specialClass}">${tag}</span>`;
    }).join('');

    card.innerHTML = `
        <button class="fav-btn ${isFav ? 'active' : ''}" onclick="event.stopPropagation(); toggleFavorite('${stream.user_login}')">★</button>
        
        <div class="multistream-selector" onclick="event.stopPropagation();">
            <input type="checkbox" id="ms-${stream.user_login}" ${isSelected ? 'checked' : ''} 
                   onchange="toggleVTuberSelection(event, '${stream.user_login}')">
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
                <img src="${stream.profile_image_url}" class="mini-pfp" 
                     onerror="this.src='https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png'" loading="lazy">
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
        const previewBox = document.getElementById(`preview-${stream.user_login}`);
        if (previewBox && previewBox.innerHTML === "") {
            previewBox.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${stream.user_login}&parent=${window.location.hostname}&muted=true&autoplay=true&controls=false" height="100%" width="100%" frameborder="0"></iframe>`;
        }
    });
    clickArea.addEventListener('mouseleave', () => {
        const previewBox = document.getElementById(`preview-${stream.user_login}`);
        if (previewBox) previewBox.innerHTML = "";
    });

    clickArea.onclick = () => openPlayer(stream.user_login, stream.viewer_count, stream.user_id, stream.profile_image_url);
    return card;
}

// --- LOGIQUE MULTISTREAM ---

let lastMultistream = JSON.parse(localStorage.getItem('vcore_last_multistream')) || [];

function toggleVTuberSelection(event, login) {
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
    const checkboxes = document.querySelectorAll('.multistream-selector input[type="checkbox"]');
    checkboxes.forEach(cb => cb.checked = false);
    updateMultistreamBar();
}

function launchMultistream() {
    localStorage.setItem('vcore_last_multistream', JSON.stringify(selectedVTubers));
    const url = `multistream.html?streams=${selectedVTubers.join(',')}`;
    window.open(url, '_blank');
}

function launchHistoryMultistream() {
    const url = `multistream.html?streams=${lastMultistream.join(',')}`;
    window.open(url, '_blank');
}

function clearHistory() {
    localStorage.removeItem('vcore_last_multistream');
    lastMultistream = [];
    updateMultistreamBar();
}

function initDragAndDrop() {
    const container = document.getElementById('multistream-container');

    Sortable.create(container, {
        animation: 150, // Vitesse de l'animation en ms
        ghostClass: 'sortable-ghost', // Classe appliquée à l'élément fantôme (pendant le déplacement)
        handle: '.drag-handle', // On limite le déplacement à une petite poignée (optionnel mais conseillé)
        onStart: function() {
            // Optionnel : on peut masquer les iframes temporairement pour fluidifier
            container.classList.add('is-dragging');
        },
        onEnd: function() {
            container.classList.remove('is-dragging');
        }
    });
}

// --- LE RESTE DU CODE (PLAYER, SCROLL ETC) ---

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
    theater.classList.add('hidden');
    document.getElementById('video-wrapper').innerHTML = '';
    document.getElementById('chat-wrapper').innerHTML = '';
    document.body.style.overflow = 'auto';
    if (updateUrl) history.pushState("", document.title, window.location.pathname);
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
    } catch (err) { }
}

function forceRefresh() {
    startScan();
}

// Fonction pour exporter les favoris
function exportConfig() {
    const config = {
        version: "1.0",
        favorites: getFavorites(),
        exportDate: new Date().toISOString()
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "vcore_config.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

// Fonction pour importer les favoris
function importConfig(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const config = JSON.parse(e.target.result);
            
            if (config.favorites && Array.isArray(config.favorites)) {
                // On fusionne ou on remplace ? Ici on remplace pour une clean install
                localStorage.setItem(STORAGE_KEY, JSON.stringify(config.favorites));
                alert(`✅ Importation réussie ! ${config.favorites.length} favoris récupérés.`);
                
                // On rafraîchit l'affichage immédiatement
                filterAndDisplay();
            } else {
                throw new Error("Format de fichier invalide.");
            }
        } catch (err) {
            console.error("Erreur import:", err);
            alert("❌ Erreur : Le fichier est corrompu ou n'est pas au bon format.");
        }
    };
    reader.readAsText(file);
    
    // Reset de l'input pour permettre de réimporter le même fichier si besoin
    event.target.value = '';
}

function displayVCoreSpotlight(streams) {
    const spotlightContainer = document.getElementById('vtuber-spotlight');
    if (!spotlightContainer) return;

    // 1. Filtrer les petits streamers (ex: entre 1 et 20 viewers)
    const smallStreams = streams.filter(s => s.viewer_count > 0 && s.viewer_count <= 20);

    if (smallStreams.length === 0) {
        spotlightContainer.style.display = 'none';
        return;
    }

    // 2. Choisir un streamer au hasard
    const lucky = smallStreams[Math.floor(Math.random() * smallStreams.length)];

    // 3. Injecter le HTML (Note : on passe les datas à openPlayer pour que le théâtre fonctionne)
    spotlightContainer.innerHTML = `
        <div class="spotlight-card" onclick="openPlayer('${lucky.user_login}', ${lucky.viewer_count}, '${lucky.user_id}', '${lucky.profile_image_url}')">
            <div class="spotlight-badge">✨ Coup de Projecteur</div>
            <div class="spotlight-content">
                <div class="spotlight-img-container">
                    <img src="${getOptimizedThumb(lucky.thumbnail_url, 600, 337)}" class="spotlight-img">
                </div>
                <div class="spotlight-info">
                    <div class="spotlight-header">
                        <img src="${lucky.profile_image_url}" class="spotlight-pfp" onerror="this.src='https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png'">
                        <div>
                            <h3>${lucky.user_name}</h3>
                            <span class="spotlight-viewers">🔴 ${lucky.viewer_count.toLocaleString()} viewers</span>
                        </div>
                    </div>
                    <p class="spotlight-title">${lucky.title}</p>
                    <div class="spotlight-game">${lucky.game_name}</div>
                </div>
            </div>
        </div>
    `;
    spotlightContainer.style.display = 'block';
}