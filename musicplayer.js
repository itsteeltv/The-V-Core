// 1. Charge l'API YouTube
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var player;
var btn = document.getElementById('music-toggle');
var hasStarted = false;

// Sélection de l'equalizer (le conteneur des barres)
const equalizer = document.getElementById('equalizer');

// 2. Création du lecteur une fois l'API prête
function onYouTubeIframeAPIReady() {
    player = new YT.Player('youtube-player', {
        height: '0',
        width: '0',
        videoId: '4xDzrJKXOOY', // ID du flux Synthwave Lofi Girl
        playerVars: {
            'autoplay': 1,
            'controls': 0,
            'disablekb': 1
        },
        events: {
            'onReady': onPlayerReady
        }
    });
}

// Fonction pour activer/désactiver l'animation visuelle
function updateVisualizer(isPlaying) {
    if (!equalizer) return;
    if (isPlaying) {
        equalizer.classList.add('playing');
    } else {
        equalizer.classList.remove('playing');
    }
}

function onPlayerReady(event) {
    // Volume très doux (10%)
    player.setVolume(10);
    
    // Lance au premier clic sur la page (contrainte navigateur)
    document.addEventListener('click', () => {
        if (!hasStarted) {
            player.playVideo();
            hasStarted = true;
            updateVisualizer(true); // Lance l'animation
        }
    }, { once: true });
}

// Gestion du bouton Play/Pause
btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Évite de déclencher le listener du document
    if (!player) return;

    var state = player.getPlayerState();
    
    // YT.PlayerState.PLAYING correspond à l'état 1
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        updateVisualizer(false); // Arrête l'animation
    } else {
        player.playVideo();
        updateVisualizer(true); // Relance l'animation
    }
});