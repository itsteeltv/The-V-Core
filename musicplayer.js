// 1. Charge l'API YouTube
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

var player;
var btn = document.getElementById('music-toggle');
var hasStarted = false;

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

function onPlayerReady(event) {
    // Volume doux à 30%
    player.setVolume(10);
    
    // Lance au premier clic sur la page (contrainte navigateur)
    document.addEventListener('click', () => {
        if (!hasStarted) {
            player.playVideo();
            hasStarted = true;
            btn.innerHTML = "🔊";
        }
    }, { once: true });
}

// Gestion du bouton Play/Pause
btn.addEventListener('click', (e) => {
    e.stopPropagation(); // Évite de déclencher le listener du document
    if (!player) return;

    var state = player.getPlayerState();
    if (state === YT.PlayerState.PLAYING) {
        player.pauseVideo();
        btn.innerHTML = "🔇";
    } else {
        player.playVideo();
        btn.innerHTML = "🔊";
    }
});