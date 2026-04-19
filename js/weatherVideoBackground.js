// weatherVideoBackground.js
// Adds a full-screen <video> background behind all content and exposes
// `updateWeatherBackground(condition)` which maps a weather condition
// to a video file in `/assets/weather-animations/` and crossfades smoothly.

(function(){
    const ASSET_PATH = '/assets/weather-animations/';
    const VIDEO_CONTAINER_ID = 'weather-video-container';
    const VIDEO_A_ID = 'weather-video-a';
    const VIDEO_B_ID = 'weather-video-b';
    const FADE_MS = 700;

    // Map normalized condition -> filename
    const conditionToFile = {
        'clear': 'animated_sunny.mp4',
        'sunny': 'animated_sunny.mp4',
        'partly cloudy': 'animated_clouds.mp4',
        'partly_cloudy': 'animated_clouds.mp4',
        'clouds': 'animated_clouds.mp4',
        'cloudy': 'animated_clouds.mp4',
        'overcast': 'animated_dark_clouds.mp4',
        'rain': 'animated_rain.mp4',
        'drizzle': 'animated_rain.mp4',
        'thunderstorm': 'animated_storm.mp4',
        'snow': 'animated_snow.mp4',
        'mist': 'animated_fog.mp4',
        'fog': 'animated_fog.mp4',
        // night variants
        'night_clear': 'animated_night.mp4',
        'night_clouds': 'animated_night_clouds.mp4'
    };

    // Minimal CSS injected to keep video behind everything and cover screen
    function injectStyles(){
        if (document.getElementById('weather-video-styles')) return;
        const css = `
            #${VIDEO_CONTAINER_ID} { position: fixed; left:0; top:0; width:100%; height:100%; overflow:hidden; pointer-events:none; z-index:-1; }
            #${VIDEO_CONTAINER_ID} video { position:absolute; left:0; top:0; width:100%; height:100%; object-fit:cover; -webkit-object-fit:cover; transition: opacity ${FADE_MS}ms ease-in-out; }
            #${VIDEO_CONTAINER_ID} video.hidden { opacity:0; }
            #${VIDEO_CONTAINER_ID} video.visible { opacity:1; }
        `;
        const s = document.createElement('style'); s.id = 'weather-video-styles'; s.innerHTML = css; document.head.appendChild(s);
    }

    function ensureContainer(){
        let container = document.getElementById(VIDEO_CONTAINER_ID);
        if (!container) {
            container = document.createElement('div');
            container.id = VIDEO_CONTAINER_ID;
            // Insert as first child so it's available behind content; z-index keeps it behind
            document.body.insertBefore(container, document.body.firstChild);

            // create two video elements for crossfading
            const va = document.createElement('video');
            va.id = VIDEO_A_ID;
            va.setAttribute('autoplay','');
            va.setAttribute('muted','');
            va.setAttribute('loop','');
            va.setAttribute('playsinline','');
            va.className = 'hidden';
            container.appendChild(va);

            const vb = document.createElement('video');
            vb.id = VIDEO_B_ID;
            vb.setAttribute('autoplay','');
            vb.setAttribute('muted','');
            vb.setAttribute('loop','');
            vb.setAttribute('playsinline','');
            vb.className = 'hidden';
            container.appendChild(vb);
        }
        return container;
    }

    // Pick file for a normalized condition string
    function mapConditionToFile(cond){
        if (!cond) return conditionToFile['clouds'];
        const key = String(cond).trim().toLowerCase().replace(/\s+/g, ' ');
        // If caller passed explicit night tag like 'night:Clear' or 'Clear-night', handle
        if (key.indexOf('night') !== -1) {
            // try 'night_clear' or 'night_clouds'
            if (key.indexOf('clear') !== -1) return conditionToFile['night_clear'];
            if (key.indexOf('cloud') !== -1) return conditionToFile['night_clouds'];
            // fallback to night_clear
            return conditionToFile['night_clear'];
        }
        // direct mapping attempts
        if (conditionToFile[key]) return conditionToFile[key];
        // check keywords
        if (key.indexOf('clear') !== -1 || key.indexOf('sun') !== -1) return conditionToFile['clear'];
        if (key.indexOf('partly') !== -1 && key.indexOf('cloud') !== -1) return conditionToFile['partly cloudy'];
        if (key.indexOf('cloud') !== -1) return conditionToFile['clouds'];
        if (key.indexOf('overcast') !== -1) return conditionToFile['overcast'];
        if (key.indexOf('rain') !== -1 || key.indexOf('drizzle') !== -1) return conditionToFile['rain'];
        if (key.indexOf('thunder') !== -1 || key.indexOf('storm') !== -1) return conditionToFile['thunderstorm'];
        if (key.indexOf('snow') !== -1) return conditionToFile['snow'];
        if (key.indexOf('mist') !== -1 || key.indexOf('fog') !== -1) return conditionToFile['mist'];
        return conditionToFile['clouds'];
    }

    // Crossfade to a new video src (relative filename under ASSET_PATH)
    function crossfadeTo(fileName){
        if (!fileName) return;
        const container = ensureContainer();
        const va = document.getElementById(VIDEO_A_ID);
        const vb = document.getElementById(VIDEO_B_ID);
        // decide which is front (visible)
        let front = va.classList.contains('visible') ? va : vb;
        let back = front === va ? vb : va;

        // set back video src and load
        const src = ASSET_PATH + fileName;
        if (back.getAttribute('data-src') === src) {
            // already loaded as back; just swap
            back.classList.remove('hidden'); back.classList.add('visible');
            front.classList.remove('visible'); front.classList.add('hidden');
            // ensure looping
            back.play().catch(() => {});
            return;
        }

        back.pause();
        back.removeAttribute('src');
        back.setAttribute('src', src);
        back.setAttribute('data-src', src);
        back.load();

        // once canplay, start playing and crossfade
        const onCanPlay = () => {
            back.removeEventListener('canplay', onCanPlay);
            back.play().catch(() => {});
            // start crossfade: make back visible, front hidden
            back.classList.remove('hidden'); back.classList.add('visible');
            front.classList.remove('visible'); front.classList.add('hidden');
            // after fade delay, pause and clear front to reduce memory
            setTimeout(()=>{
                try { front.pause(); } catch(e){}
                // keep src cached on front for potential quick swap; do not remove by default
            }, FADE_MS + 80);
        };
        back.addEventListener('canplay', onCanPlay);
    }

    // Public API: updateWeatherBackground(condition)
    function updateWeatherBackground(condition){
        try {
            injectStyles();
            ensureContainer();
            const file = mapConditionToFile(condition);
            if (!file) return;
            crossfadeTo(file);
        } catch (e) {
            console.warn('updateWeatherBackground failed', e);
        }
    }

    // Expose globally
    if (typeof window !== 'undefined') {
        window.updateWeatherBackground = updateWeatherBackground;
        // also expose internal for debug
        window._weatherVideoBackground = { mapConditionToFile };
    }
})();
