// --- CONFIGURATION ---
const CLIENT_ID_ROULETTE = '00b8gxihwie71gneokv87snoi0fbqe';
const CLIENT_SECRET_ROULETTE = 'rpy4mumxeic8ujmrbewf7ji5yxb9gk';

// --- INITIALISATION ---
document.addEventListener('DOMContentLoaded', () => {
    // Initialisation du thème au chargement
    const savedTheme = localStorage.getItem('vcore-theme') || 'default';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Initialisation des icônes Lucide
    if (window.lucide) lucide.createIcons();

    // Gestion du bouton de changement de thème
    const themeBtn = document.getElementById('theme-cycle-btn');
    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const themes = ['default', 'dark-purist', 'white-light'];
            let current = document.documentElement.getAttribute('data-theme') || 'default';
            let nextIndex = (themes.indexOf(current) + 1) % themes.length;
            let nextTheme = themes[nextIndex];

            document.documentElement.setAttribute('data-theme', nextTheme);
            localStorage.setItem('vcore-theme', nextTheme);
            
            // Ajustement de la couleur de fond forcée pour éviter le flash blanc/noir
            const bgColor = nextTheme === 'white-light' ? '#ffffff' : '#0e0e10';
            document.documentElement.style.backgroundColor = bgColor;
        });
    }

    // Gestion de l'effet étincelles sur le bouton spin
    const spinBtn = document.getElementById('spin-button');
    if (spinBtn) {
        spinBtn.addEventListener('click', (e) => {
            for (let i = 0; i < 10; i++) {
                const sparkle = document.createElement('div');
                sparkle.classList.add('sparkle-effect');
                sparkle.style.left = `${e.clientX}px`;
                sparkle.style.top = `${e.clientY}px`;
                sparkle.style.setProperty('--x', `${(Math.random() - 0.5) * 200}px`);
                sparkle.style.setProperty('--y', `${(Math.random() - 0.5) * 200}px`);
                document.body.appendChild(sparkle);
                setTimeout(() => sparkle.remove(), 600);
            }
            spinTheWheel(); // Lance la roulette
        });
    }

    // Animation de transition entre les pages
    initPageTransitions();
});

// --- LOGIQUE ROULETTE TWITCH ---

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
    const audio = document.getElementById('spin-audio');
    
    if (audio) {
        audio.currentTime = 0;
        audio.play();
    }

    btn.disabled = true;
    btn.innerText = "🔍 Scan profond..."; 
    display.innerHTML = '<div class="placeholder-wheel">?</div>';
    display.classList.add('spinning-active');

    try {
        const token = await getRouletteToken();
        let allVtubers = [];
        let cursor = "";
        
        // Scan de 500 streams pour trouver des VTubers
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

            const found = result.data.filter(s => {
                const hasTag = s.tags && s.tags.some(t => t.toLowerCase().includes('vtuber'));
                const hasTitle = s.title.toLowerCase().includes('vtuber');
                return hasTag || hasTitle;
            });

            allVtubers = [...allVtubers, ...found];
            cursor = result.pagination?.cursor;
            if (!cursor) break;
        }

        setTimeout(() => {
            if (audio) { audio.pause(); audio.currentTime = 0; }
            display.classList.remove('spinning-active');
            
            if (allVtubers.length > 0) {
                const lucky = allVtubers[Math.floor(Math.random() * allVtubers.length)];
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
                    </div>`;
            } else {
                display.innerHTML = `<p>Désolé, aucun VTuber FR détecté actuellement. 😭</p>`;
            }
            
            btn.disabled = false;
            btn.innerText = "🎰 Relancer la roue";
        }, 1200);

    } catch (error) {
        console.error("Erreur Roulette:", error);
        btn.disabled = false;
        btn.innerText = "❌ Erreur";
    }
}

// --- RECHERCHE ET NAVIGATION ---

function executeGlobalSearch() {
    const query = document.getElementById('global-search').value.trim();
    if (query) {
        window.location.href = `discvvtfr.html?search=${encodeURIComponent(query)}`;
    }
}

function initPageTransitions() {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', function(e) {
            const target = this.href;
            if (target.includes(window.location.origin) || target.startsWith('/')) {
                e.preventDefault();
                document.body.style.transition = "opacity 0.3s ease";
                document.body.style.opacity = "0";
                setTimeout(() => { window.location.href = target; }, 300);
            }
        });
    });
}

// Service Worker pour PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('Erreur PWA:', err));
    });
}