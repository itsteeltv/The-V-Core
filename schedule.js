// Configuration
const CLIENT_ID = '00b8gxihwie71gneokv87snoi0fbqe'; 
const REDIRECT_URI = window.location.origin + window.location.pathname; 
const SCOPES = 'user:read:broadcast channel:manage:schedule';

let currentUserId = null;

document.addEventListener('DOMContentLoaded', () => {
    checkAuth(); 

    const loginBtn = document.getElementById('twitch-login-btn');
    if (loginBtn) loginBtn.addEventListener('click', startTwitchAuth);

    const addStreamBtn = document.getElementById('add-stream-btn');
    if (addStreamBtn) addStreamBtn.addEventListener('click', handleAddStream);
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
    if (hash) {
        const params = new URLSearchParams(hash.substring(1));
        const token = params.get('access_token');
        if (token) {
            localStorage.setItem('twitch_user_token', token);
            window.location.hash = ''; 
            initDashboard(token);
        }
    } else {
        const savedToken = localStorage.getItem('twitch_user_token');
        if (savedToken) initDashboard(savedToken);
    }
}

// --- ÉTAPE 2 : RÉCUPÉRATION DES INFOS ---

async function initDashboard(token) {
    try {
        const userRes = await fetch('https://api.twitch.tv/helix/users', {
            headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
        });
        const userData = await userRes.json();

        if (!userData.data || userData.data.length === 0) throw new Error("Utilisateur non trouvé");

        const user = userData.data[0];
        currentUserId = user.id;

        const authSection = document.getElementById('auth-section');
        if (authSection) {
            authSection.innerHTML = `
                <div class="user-profile">
                    <img src="${user.profile_image_url}" width="40" style="border-radius:50%">
                    <span>Salut, ${user.display_name} !</span>
                    <button onclick="logout()" class="edit-btn" style="margin-left:10px">Déconnexion</button>
                </div>`;
        }

        const form = document.getElementById('add-stream-form');
        if (form) form.classList.remove('hidden');
        
        const controls = document.getElementById('schedule-controls');
        if (controls) controls.classList.remove('hidden');

        loadMySchedule(token, user.id);
    } catch (err) {
        console.error("Erreur init:", err);
        localStorage.removeItem('twitch_user_token');
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
            if (viewer) viewer.innerHTML = "<p>Aucun stream prévu pour le moment.</p>";
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
    
    // 1. On prépare l'en-tête
    viewer.innerHTML = `
        <div class="export-header">
            <h3>Mon Planning de la Semaine</h3>
            ${personalMsg ? `<p class="personal-msg-display">✨ ${personalMsg}</p>` : ''}
        </div>
        <div class="weekly-grid"></div>
    `;

    const weeklyGrid = viewer.querySelector('.weekly-grid');
    
    // 2. On définit l'ordre des jours en français
    const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
    
    // 3. On crée un objet pour regrouper les streams par jour
    // ex: { "Lundi": [stream1, stream2], "Mardi": [] ... }
    const groupedSegments = {};
    daysOfWeek.forEach(day => groupedSegments[day] = []);

    segments.forEach(seg => {
        const date = new Date(seg.start_time);
        // On récupère le nom du jour (ex: "lundi") et on met la 1ère lettre en majuscule
        let dayName = date.toLocaleDateString('fr-FR', { weekday: 'long' });
        dayName = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        
        if (groupedSegments[dayName]) {
            groupedSegments[dayName].push(seg);
        }
    });

    // 4. On génère le HTML pour chaque colonne de jour
    daysOfWeek.forEach(day => {
        const dayStreams = groupedSegments[day];
        const dayColumn = document.createElement('div');
        dayColumn.className = 'day-column';
        
        let streamsHTML = '';
        if (dayStreams.length === 0) {
            streamsHTML = `<div class="no-stream">Repos</div>`;
        } else {
            // On trie les streams du jour par heure
            dayStreams.sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
            
            dayStreams.forEach(seg => {
                const isCollab = seg.title.toUpperCase().includes('COLLAB');
                streamsHTML += `
                    <div class="compact-stream-card ${isCollab ? 'collab-mode' : ''}">
                        <div class="hour">${new Date(seg.start_time).toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'})}</div>
                        <div class="category">${seg.category ? seg.category.name : 'Gaming'}</div>
                        <div class="stream-title">${seg.title}</div>
                        <div class="card-actions">
                             <button onclick="deleteSegment('${seg.id}')" title="Supprimer">🗑️</button>
                        </div>
                    </div>
                `;
            });
        }

        dayColumn.innerHTML = `
            <div class="day-name">${day}</div>
            <div class="day-content">${streamsHTML}</div>
        `;
        weeklyGrid.appendChild(dayColumn);
    });
}

// --- ACTIONS TWITCH ---

async function deleteSegment(segmentId) {
    if (!confirm("Voulez-vous vraiment annuler ce stream ?")) return;
    const token = localStorage.getItem('twitch_user_token');
    const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${currentUserId}&id=${segmentId}`, {
        method: 'DELETE',
        headers: { 'Client-ID': CLIENT_ID, 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) loadMySchedule(token, currentUserId);
}

async function editSegment(segmentId, currentTitle) {
    const newTitle = prompt("Entrez le nouveau titre :", currentTitle);
    if (!newTitle) return;
    const token = localStorage.getItem('twitch_user_token');
    const res = await fetch(`https://api.twitch.tv/helix/schedule/segment?broadcaster_id=${currentUserId}&id=${segmentId}`, {
        method: 'PATCH',
        headers: {
            'Client-ID': CLIENT_ID,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: newTitle })
    });
    if (res.ok) loadMySchedule(token, currentUserId);
}

async function handleAddStream() {
    const token = localStorage.getItem('twitch_user_token');
    const titleInput = document.getElementById('new-title');
    const dateInput = document.getElementById('new-date'); // On s'en sert pour l'heure de début
    const categoryInput = document.getElementById('new-category');
    const collabInput = document.getElementById('is-collab');
    const dayChecks = document.querySelectorAll('.day-check input:checked');

    if (!titleInput.value || !dateInput.value) return alert("Veuillez remplir le titre et l'heure !");

    const finalTitle = collabInput.checked ? `[COLLAB] ${titleInput.value}` : titleInput.value;
    const baseDate = new Date(dateInput.value);
    
    // Si aucun jour n'est coché, on utilise juste la date du sélecteur
    let datesToPost = [];
    if (dayChecks.length === 0) {
        datesToPost.push(baseDate);
    } else {
        // Pour chaque jour coché, on ajuste la date
        dayChecks.forEach(check => {
            let targetDay = parseInt(check.value);
            let d = new Date(baseDate);
            let currentDay = d.getDay();
            let diff = targetDay - currentDay;
            // On ajuste pour que ce soit dans la semaine choisie
            d.setDate(d.getDate() + diff);
            datesToPost.push(d);
        });
    }

    // On envoie les requêtes une par une (Twitch ne permet pas l'envoi groupé en une fois)
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
        alert(`${datesToPost.length} créneau(x) ajouté(s) avec succès !`);
        loadMySchedule(token, currentUserId);
        
        // Reset
        titleInput.value = "";
        dayChecks.forEach(c => c.checked = false);
    } catch (err) {
        console.error(err);
        alert("Erreur lors de l'ajout multi-créneaux.");
    }
}

function logout() {
    localStorage.removeItem('twitch_user_token');
    window.location.reload();
}

// --- GÉNÉRATION IMAGE ---

document.getElementById('download-btn')?.addEventListener('click', async () => {
    // On relance le rendu juste avant pour s'assurer que le message perso est à jour
    const token = localStorage.getItem('twitch_user_token');
    if (token && currentUserId) {
        await loadMySchedule(token, currentUserId);
    }

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
        link.download = `Planning_TheVCore_${new Date().toLocaleDateString()}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();

    } catch (err) {
        console.error("Erreur export:", err);
    } finally {
        element.classList.remove('export-mode');
        btn.innerText = "📸 Télécharger mon planning (PNG)";
        btn.disabled = false;
    }
});