const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';

let allCachedVTubers = []; 
let filteredVTubers = [];  
let viewerUpdateInterval = null;

// Pagination locale
let currentPage = 1;
const itemsPerPage = 20;


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
function getOptimizedThumb(url, w = 440, h = 248) {
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
    const grid = document.getElementById('vtuber-grid');
    const status = document.getElementById('status');
    const btn = document.getElementById('refresh-btn');
    
    
    // 1. Préparation de l'interface
    if (btn) {
        btn.disabled = true;
        btn.innerText = "🔄 Scan en cours...";
    }
    status.innerHTML = "⏳ Initialisation du scan...";

    try {
        // Vérification de la connexion internet
        if (!navigator.onLine) {
            throw new Error("Pas de connexion internet.");
        }

        const token = await getTwitchToken();
        if (!token) {
            throw new Error("Impossible de récupérer le jeton Twitch.");
        }
        
        allCachedVTubers = [];
        const seenIDs = new Set();
        let cursor = "";
        const MAX_PAGES = 11; 
        
        for (let i = 0; i < MAX_PAGES; i++) {
            status.innerText = `🔍 Scan page ${i + 1}/${MAX_PAGES}...`;
            
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, { 
                headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` } 
            });

            if (!response.ok) {
                throw new Error(`Erreur API Twitch (${response.status})`);
            }

            const result = await response.json();
            if (!result.data || result.data.length === 0) break;

            // ... (Ta logique de filtrage des tags VTuber reste la même ici) ...
            const pageMatches = result.data.filter(stream => {
                const hasTag = stream.tags && stream.tags.some(t => t.toLowerCase().includes('vtuber'));
                if (hasTag && !seenIDs.has(stream.user_id)) {
                    seenIDs.add(stream.user_id);
                    return true;
                }
                return false;
            });

            // Récupération des avatars (logique inchangée)
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

        status.innerHTML = `✅ <strong>${allCachedVTubers.length}</strong> VTubers trouvés.`;
        updateCategoryMenu(allCachedVTubers);
        filterAndDisplay(); 

    } catch (error) {
        console.error("Détails de l'erreur:", error);
        
        // Affichage du message d'erreur à l'utilisateur
        let userMessage = "❌ Oups, Twitch ne répond pas.";
        
        if (!navigator.onLine) {
            userMessage = "🌐 Vérifie ta connexion internet.";
        } else if (error.message.includes("401")) {
            userMessage = "🔑 Erreur d'authentification (Token invalide).";
        }

        status.innerHTML = `<span style="color: #ff4f4f;">${userMessage}</span>`;
        
        // Optionnel : Afficher un message dans la grille si elle est vide
        if (allCachedVTubers.length === 0) {
            grid.innerHTML = `<div class="error-notice">Impossible de charger les streams. Réessaie plus tard.</div>`;
        }
    } finally {
        // Dans tous les cas (succès ou erreur), on réactive le bouton
        if (btn) {
            btn.disabled = false;
            btn.innerText = "🔄 Actualiser la liste";
        }
    }
}

// --- LOGIQUE D'AFFICHAGE ---

function filterAndDisplay() {
    const searchTerm = document.getElementById('search-input')?.value.toLowerCase() || "";
    const selectedCategory = document.getElementById('category-filter')?.value || "all";

    filteredVTubers = allCachedVTubers.filter(s => {
        const tagsString = (s.tags || []).join(' ').toLowerCase();
        const matchesSearch = s.user_name.toLowerCase().includes(searchTerm) || 
                             (s.title && s.title.toLowerCase().includes(searchTerm)) ||
                             tagsString.includes(searchTerm);
        const matchesCategory = (selectedCategory === "all") || (s.game_name === selectedCategory);
        return matchesSearch && matchesCategory;
    });

    const favs = getFavorites();
    filteredVTubers.sort((a, b) => {
        const aFav = favs.includes(a.user_login);
        const bFav = favs.includes(b.user_login);
        if (aFav !== bFav) return bFav - aFav;
        return b.viewer_count - a.viewer_count;
    });

    const grid = document.getElementById('vtuber-grid');
    grid.innerHTML = '';
    currentPage = 1;

    loadMoreItems();
    setupInfiniteScroll();
}

function loadMoreItems() {
    const grid = document.getElementById('vtuber-grid');
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

    const tagsHtml = (stream.tags || [])
        .slice(0, 3)
        .map(tag => {
            let specialClass = "";
            if(tag.toLowerCase().includes("fr")) specialClass = "tag-fr";
            if(tag.toLowerCase().includes("asmr")) specialClass = "tag-asmr";
            return `<span class="tag-badge ${specialClass}">${tag}</span>`;
        }).join('');

    card.innerHTML = `
        <div class="card-click-area">
            <div class="thumbnail-wrapper">
                <div class="preview-container" id="preview-${stream.user_login}"></div>
                <img src="${getOptimizedThumb(stream.thumbnail_url)}" class="thumbnail" loading="lazy">
                <span class="viewer-tag">🔴 ${stream.viewer_count.toLocaleString()}</span>
            </div>
            <div class="info">
                <img src="${stream.profile_image_url}" class="mini-pfp" 
                     onerror="this.src='https://static-cdn.jtvnw.net/user-default-pictures-uv/ce3a1270-bc57-431a-9391-580190117a02-profile_image-70x70.png' " loading="lazy">
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

function setupInfiniteScroll() {
    const oldSentinel = document.getElementById('scroll-sentinel');
    if (oldSentinel) oldSentinel.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'scroll-sentinel';
    document.getElementById('vtuber-grid').after(sentinel);

    const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && (currentPage - 1) * itemsPerPage < filteredVTubers.length) {
            loadMoreItems();
        }
    }, { threshold: 0.1 });

    observer.observe(sentinel);
}

// --- THÉÂTRE / PLAYER ---

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
    } catch (err) { console.error("Détails error:", err); }
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