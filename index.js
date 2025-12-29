const CLIENT_ID_ROULETTE = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET_ROULETTE = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';

async function getRouletteToken() {
    const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${CLIENT_ID_ROULETTE}&client_secret=${CLIENT_SECRET_ROULETTE}&grant_type=client_credentials`, {
        method: 'POST'
    });
    const data = await response.json();
    return data.access_token;
}

async function spinTheWheel() {
    const btn = document.getElementById('spin-button');
    const display = document.getElementById('roulette-display');
    const audio = document.getElementById('spin-audio'); // On récupère l'audio
    
    // --- NOUVEAU : Jouer le son ---
    if (audio) {
        audio.currentTime = 0; // Remet le son au début si on clique vite
        audio.play();
    }
    // ------------------------------
    btn.disabled = true;
    btn.innerText = "🔍 Scan profond..."; 
    display.innerHTML = '<div class="placeholder-wheel">?</div>';
    display.classList.add('spinning-active');

    try {
        const token = await getRouletteToken();
        let allVtubers = [];
        let cursor = "";
        
        // On va scanner 5 pages (500 streams) pour être sûr de trouver des VTubers
        for (let i = 0; i < 5; i++) {
            const url = `https://api.twitch.tv/helix/streams?language=fr&first=100${cursor ? `&after=${cursor}` : ''}`;
            const response = await fetch(url, {
                headers: {
                    'Client-ID': CLIENT_ID_ROULETTE,
                    'Authorization': `Bearer ${token}`
                }
            });
            
            const result = await response.json();
            if (!result.data || result.data.length === 0) break;

            // Filtrage : Tag VTuber OU mot clé dans le titre
            const found = result.data.filter(s => {
                const hasTag = s.tags && s.tags.some(t => t.toLowerCase().includes('vtuber'));
                const hasTitle = s.title.toLowerCase().includes('vtuber');
                return hasTag || hasTitle;
            });

            allVtubers = [...allVtubers, ...found];
            cursor = result.pagination.cursor;
            if (!cursor) break;
        }

        setTimeout(() => {
            if (audio) { audio.pause(); audio.currentTime = 0; } // On arrête le son
            display.classList.remove('spinning-active');
            
            if (allVtubers.length > 0) {
                const lucky = allVtubers[Math.floor(Math.random() * allVtubers.length)];
                // On remplace le format de l'image
                const thumb = lucky.thumbnail_url.replace('{width}', '440').replace('{height}', '248');
                
                display.innerHTML = `
                    <div class="result-card">
                        <img src="${thumb}" style="width:100%; display:block;">
                        <div style="padding:15px; text-align:left;">
                            <h3 style="color:var(--clr-purple-soft); margin:0;">${lucky.user_name}</h3>
                            <p style="font-size:0.8rem; color:var(--text-main); margin:8px 0; height:35px; overflow:hidden; opacity:0.8;">${lucky.title}</p>
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <span style="color:#ff4b4b; font-weight:bold;">🔴 ${lucky.viewer_count}</span>
                                <a href="https://twitch.tv/${lucky.user_login}" target="_blank" class="go-live-btn" style="margin:0; padding:5px 15px;">VOIR</a>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                display.innerHTML = `
                    <div style="padding:20px;">
                        <p>Désolé, aucun VTuber FR détecté dans le Top 500 actuel. 😭</p>
                        <button onclick="spinTheWheel()" style="background:none; border:1px solid var(--clr-purple-soft); color:white; margin-top:10px; cursor:pointer; border-radius:5px;">Réessayer</button>
                    </div>`;
            }
            
            btn.disabled = false;
            btn.innerText = "🎰 Relancer la roue";
        }, 1200);

    } catch (error) {
        console.error("Erreur Roulette:", error);
        btn.disabled = false;
        btn.innerText = "❌ Erreur";
        display.innerHTML = "<p>Erreur de connexion à Twitch.</p>";
    }
}

function changeTheme(themeName) {
            document.documentElement.setAttribute('data-theme', themeName);
            localStorage.setItem('vcore-theme', themeName);
        }

        window.addEventListener('DOMContentLoaded', () => {
            const saved = localStorage.getItem('vcore-theme') || 'default';
            document.getElementById('theme-select').value = saved;
        });

function executeGlobalSearch() {
                const query = document.getElementById('global-search').value.trim();
                if (query) {
                    // Redirige vers le Finder avec le paramètre de recherche
                    window.location.href = `discvvtfr.html?search=${encodeURIComponent(query)}`;
                }
            }

