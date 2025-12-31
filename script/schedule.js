// --- CONFIGURATION ---
const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe'; 
const REDIRECT_URI = window.location.origin + window.location.pathname; 
const SCOPES = 'user:read:broadcast channel:manage:schedule';

let currentUserId = null;

// --- INITIALISATION UNIQUE ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Vérifier l'authentification immédiatement au chargement
    checkAuth(); 

    // 2. Gestion des événements pour les boutons
    const loginBtn = document.getElementById('twitch-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', startTwitchAuth);

    const addStreamBtn = document.getElementById('add-stream-btn');
    if (addStreamBtn) addStreamBtn.addEventListener('click', handleAddStream);

    const downloadBtn = document.getElementById('download-btn');
    if (downloadBtn) downloadBtn.addEventListener('click', exportScheduleAsImage);

    // 3. Initialisation du thème et des icônes
    if (window.lucide) lucide.createIcons();
    initThemeLogic();
});

// --- ÉTAPE 1 : AUTHENTIFICATION ---

function startTwitchAuth() {
    const authUrl = `https://id.twitch.tv/oauth2/authorize` +
        `?client_id=${CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&response_type=token` +
        `&scope=${encodeURIComponent(SCOPES)}`;
    window.location.href = authUrl;
}

function checkAuth() {
    const hash = window.location.hash;
    // Si on revient de Twitch avec un token dans l'URL
    if (hash && hash.includes('access_token')) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            localStorage.setItem('twitch_user_token', token);
            // Nettoie l'URL proprement sans recharger
            window.history.replaceState({}, document.title, window.location.pathname);
            initDashboard(token);
            return;
        }
    } 
    
    // Sinon, on regarde si on a déjà un token en mémoire
    const savedToken = localStorage.getItem('twitch_user_token');
    if (savedToken) {
        initDashboard(savedToken);
    }
}

// --- ÉTAPE 2 : GESTION DU DASHBOARD ---

async function initDashboard(token) {
    try {
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });

        // Si le token est invalide ou expiré (Erreur 401)
        if (userRes.status === 401) throw new Error("Session expirée");

        const userData = await userRes.json();
        if (!userData.data || userData.data.length === 0) throw new Error("Utilisateur non trouvé");

        const user = userData.data[0];
        currentUserId = user.id;

        // Mise à jour de l'UI (Profil utilisateur)
        const authSection = document.getElementById('auth-section');
        if (authSection) {
            authSection.innerHTML = `
                <div class="user-profile">
                    <img src="${user.profile_image_url}" width="40" style="border-radius:50%; border: 2px solid #8245BF;">
                    <span>Salut, <strong>${user.display_name}</strong> !</span>
                    <button onclick="logout()" class="login-btn" style="padding: 5px 12px; font-size: 0.8rem; margin-left:10px;">Déconnexion</button>
                </div>`;
        }

        // Affichage des formulaires de gestion
        document.getElementById('add-stream-form')?.classList.remove('hidden');
        document.getElementById('schedule-controls')?.classList.remove('hidden');

        loadMySchedule(token, user.id);
    } catch (err) {
        console.error("Erreur d'initialisation:", err);
        logout(); // Déconnexion forcée en cas d'erreur token
    }
}

async function loadMySchedule(token, userId) {
    const viewer = document.getElementById('schedule-viewer');
    const placeholder = document.getElementById('placeholder');
    
    try {
        const res = await fetch(`https://api.twitch.tv/helix/schedule?broadcaster_id=${userId}`, {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const data = await res.json();
        
        if (placeholder) placeholder.style.display = 'none';
        if (viewer) viewer.classList.remove('viewer-hidden');

        if (!data.data || !data.data.segments || data.data.segments.length === 0) {
            if (viewer) viewer.innerHTML = "<p class='placeholder-text'>Aucun stream prévu dans ton planning Twitch.</p>";
            return;
        }

        renderSchedule(data.data.segments);
    } catch (err) {
        if (viewer) viewer.innerHTML = "<p>Erreur lors du chargement du planning.</p>";
    }
}

function renderSchedule(segments) {
    const viewer = document.getElementById('schedule-viewer');
    if (!viewer) return;

    const personalMsg = document.getElementById('personal-message')?.value || "";
    
    viewer.innerHTML = `
        <div class="export-header">
            <h3>Mon Planning de la Semaine</h3>
            ${personalMsg ? `<p class="personal-msg-display">✨ ${personalMsg}</p>` : ''}
        </div>
        <div class="weekly-grid"></div>
    `;

    const weeklyGrid = viewer.querySelector('.weekly-grid');
    const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    const groupedSegments = {};
    daysOfWeek.forEach(day => groupedSegments[day] = []);

    segments.forEach(seg => {
        const date = new Date(seg.start_time);
        let dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        
        if (groupedSegments[dayName]) {
            groupedSegments[dayName].push(seg);
        }
    });

    daysOfWeek.forEach(day => {
        const dayStreams = groupedSegments[day];
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        let streamsHTML = '';
        if (dayStreams.length === 0) {
            streamsHTML = `<div class="no-stream">Repos</div>`;
        } else {
            dayStreams.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            dayStreams.forEach(seg => {
                const isCollab = seg.title.toUpperCase().includes('COLLAB');
                streamsHTML += `
                    <div class="compact-stream-card ${isCollab ? 'collab-mode' : ''}">
                        <div class="hour">${new Date(seg.start_time).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                        <div class="category">${seg.category ? seg.category.name : 'Gaming'}</div>
                        <div class="stream-title">${seg.title}</div>
                        <div class="card-actions">
                             <button class="delete-btn" onclick="deleteSegment('${seg.id}')" title="Supprimer">🗑️</button>
                        </div>
                    </div>`;
            });
        }

        dayColumn.innerHTML = `<div class="day-name">${day}</div><div class="day-content">${streamsHTML}</div>`;
        weeklyGrid.appendChild(dayColumn);
    });
}

// --- ACTIONS TWITCH ---

async function deleteSegment(segmentId) {
    if (!confirm("Voulez-vous vraiment annuler ce stream ?")) return;
    const token = localStorage.getItem('twitch_user_token');
    try {
        const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${currentUserId}&id=${segmentId}`, {
            method: 'DELETE',
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) loadMySchedule(token, currentUserId);
    } catch (err) { alert("Erreur lors de la suppression."); }
}

async function handleAddStream() {
    const token = localStorage.getItem('twitch_user_token');
    const titleInput = document.getElementById('new-title');
    const dateInput = document.getElementById('new-date');
    const categoryInput = document.getElementById('new-category');
    const collabInput = document.getElementById('is-collab');
    const dayChecks = document.querySelectorAll('.day-check input:checked');

    if (!titleInput.value || !dateInput.value) return alert("Veuillez remplir le titre et l'heure !");

    const finalTitle = collabInput.checked ? `[COLLAB] ${titleInput.value}` : titleInput.value;
    const baseDate = new Date(dateInput.value);
    
    let datesToPost = [];
    if (dayChecks.length === 0) {
        datesToPost.push(baseDate);
    } else {
        dayChecks.forEach(check => {
            let targetDay = parseInt(check.value);
            let d = new Date(baseDate);
            let currentDay = d.getDay();
            let diff = targetDay - currentDay;
            d.setDate(d.getDate() + diff);
            datesToPost.push(d);
        });
    }

    try {
        const promises = datesToPost.map(date => {
            return fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${currentUserId}`, {
                method: 'POST',
                headers: {
                    'Client-ID': CLIENT_ID,
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    start_time: date.toISOString(),
                    timezone: "Europe/Paris",
                    duration: "180",
                    is_recurring: false,
                    title: finalTitle,
                    category_id: categoryInput.value
                })
            });
        });

        await Promise.all(promises);
        alert("Planning mis à jour !");
        loadMySchedule(token, currentUserId);
        
        // Reset formulaire
        titleInput.value = "";
        dayChecks.forEach(c => c.checked = false);
    } catch (err) {
        alert("Erreur lors de l'ajout.");
    }
}

// --- UTILITAIRES ---

function logout() {
    localStorage.removeItem('twitch_user_token');
    window.location.href = window.location.pathname; // Redirige vers la page propre
}

async function exportScheduleAsImage() {
    const element = document.getElementById('schedule-viewer');
    const btn = document.getElementById('download-btn');
    
    btn.innerText = "⏳ Génération...";
    btn.disabled = true;
    element.classList.add('export-mode');

    try {
        const canvas = await html2canvas(element, {
            backgroundColor: "#0e0e10",
            scale: 2, 
            useCORS: true,
            logging: false
        });

        const link = document.createElement('a');
        link.download = `Planning_VCore_${new Date().toLocaleDateString()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
    } catch (err) {
        console.error("Erreur export:", err);
    } finally {
        element.classList.remove('export-mode');
        btn.innerText = "📸 Télécharger mon planning (PNG)";
        btn.disabled = false;
    }
}

function initThemeLogic() {
    const themes = ['default', 'dark-purist', 'white-light'];
    const themeBtn = document.getElementById('theme-cycle-btn');
    
    const savedTheme = localStorage.getItem('vcore-theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            let current = document.documentElement.getAttribute('data-theme') || 'default';
            let nextIndex = (themes.indexOf(current) + 1) % themes.length;
            let nextTheme = themes[nextIndex];
            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem('vcore-theme', nextTheme);
        });
    }
}