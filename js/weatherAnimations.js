// Weather Animations Controller
// Provides loadWeatherBackground(condition, timeOfDay) and removeExistingWeatherAnimation()

(function(){
    class WeatherAnimations {
        constructor() {
            this.containerId = 'dynamic-weather-overlay';
            this.canvasId = 'dynamic-weather-canvas';
            this._animFrame = null;
            this._particles = [];
            this._mode = null;
            this._timeOfDay = null;
            this._lastTick = performance.now();
            this._stylesInjected = false;
        }

        _injectStyles() {
            if (this._stylesInjected) return;
            this._stylesInjected = true;
            const css = `
            /* Dynamic weather overlay styles */
            #${this.containerId} { position: fixed; left:0; top:0; width:100%; height:100%; pointer-events:none; z-index:-1; overflow:hidden; }
            #${this.containerId} .wa-sky { position:absolute; inset:0; }
            #${this.containerId} .wa-layer { position:absolute; inset:0; pointer-events:none; }
            #${this.containerId} .wa-cloud { position:absolute; top:10%; left:-25%; width:60%; height:120px; background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(245,245,245,0.8)); border-radius:60px; filter: blur(20px); opacity:0.9; transform: translateX(0); }
            @keyframes wa-cloud-move { from { transform: translateX(-10%); } to { transform: translateX(110%); } }
            #${this.containerId} .wa-cloud.layer-1 { animation: wa-cloud-move 60s linear infinite; opacity:0.85; }
            #${this.containerId} .wa-cloud.layer-2 { top:25%; height:140px; animation-duration:90s; opacity:0.7; filter: blur(26px); }
            #${this.containerId} .wa-cloud.layer-3 { top:40%; height:100px; animation-duration:120s; opacity:0.6; filter: blur(18px); }

            /* Sun / Moon */
            #${this.containerId} .wa-sun { position:absolute; right:8%; top:10%; width:160px; height:160px; border-radius:50%; background: radial-gradient(circle at 35% 30%, rgba(255,245,200,0.95), rgba(255,200,80,0.85) 40%, rgba(255,180,50,0.65) 60%, rgba(255,180,50,0)); box-shadow: 0 0 80px rgba(255,200,80,0.25); filter: blur(0.6px); }
            #${this.containerId} .wa-moon { position:absolute; right:8%; top:8%; width:120px; height:120px; border-radius:50%; background: radial-gradient(circle at 30% 25%, rgba(255,255,230,0.95), rgba(220,220,240,0.9) 35%, rgba(200,200,230,0.6) 60%, rgba(0,0,0,0)); box-shadow: 0 0 40px rgba(200,200,255,0.08); }

            /* Stars */
            #${this.containerId} .wa-star { position:absolute; width:3px; height:3px; background: white; border-radius:50%; opacity:0; animation: wa-star-twinkle 3.5s infinite; }
            @keyframes wa-star-twinkle { 0%{opacity:0} 30%{opacity:0.9} 60%{opacity:0.2} 100%{opacity:0} }

            /* Rain canvas sits in overlay */
            #${this.containerId} canvas { position:absolute; left:0; top:0; width:100%; height:100%; pointer-events:none; }

            /* Thunder flash */
            #${this.containerId} .wa-flash { position:absolute; inset:0; background: rgba(255,255,255,0.0); pointer-events:none; }

            /* Subtle darkening for storm/rain */
            #${this.containerId} .wa-dim { position:absolute; inset:0; background: rgba(0,0,0,0.12); pointer-events:none; }

            `;
            const style = document.createElement('style');
            style.id = 'weather-animations-styles';
            style.innerHTML = css;
            document.head.appendChild(style);
        }

        removeExistingWeatherAnimation() {
            try {
                if (this._animFrame) {
                    cancelAnimationFrame(this._animFrame);
                    this._animFrame = null;
                }
                const existing = document.getElementById(this.containerId);
                if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
                this._particles = [];
                this._mode = null;
            } catch (e) {
                console.warn('removeExistingWeatherAnimation error', e);
            }
        }

        async loadWeatherBackground(condition = 'Clear', timeOfDay = 'Day') {
            try {
                this._injectStyles();
                this.removeExistingWeatherAnimation();

                this._mode = (condition || 'Clear').toLowerCase();
                this._timeOfDay = (timeOfDay || 'Day').toLowerCase();

                const container = document.createElement('div');
                container.id = this.containerId;
                container.className = `weather-mode-${this._mode} weather-time-${this._timeOfDay}`;

                // Sky layer (gradient)
                const sky = document.createElement('div');
                sky.className = 'wa-sky wa-layer';
                container.appendChild(sky);

                // Add sun or moon for clear
                if (this._mode === 'clear') {
                    if (this._timeOfDay === 'night') {
                        const moon = document.createElement('div'); moon.className = 'wa-moon'; container.appendChild(moon);
                        // add stars
                        this._createStars(container);
                        sky.style.background = 'linear-gradient(180deg,#04122b 0%, #0b2340 60%, #11273a 100%)';
                    } else {
                        const sun = document.createElement('div'); sun.className = 'wa-sun'; container.appendChild(sun);
                        // light morning/afternoon gradients
                        if (this._timeOfDay === 'morning') sky.style.background = 'linear-gradient(180deg,#bfe9ff 0%, #a7dbff 50%, #87c9ff 100%)';
                        else if (this._timeOfDay === 'afternoon') sky.style.background = 'linear-gradient(180deg,#87ceeb 0%, #6ec1f3 60%, #4aa7e6 100%)';
                        else sky.style.background = 'linear-gradient(180deg,#9fd7ff 0%, #76cfff 50%, #4ebaf0 100%)';

                        // subtle clouds
                        this._createClouds(container);
                    }
                }

                if (this._mode === 'clouds') {
                    sky.style.background = this._timeOfDay === 'night' ? 'linear-gradient(180deg,#1b2636 0%, #122033 100%)' : 'linear-gradient(180deg,#dfeffb 0%, #c9e7fb 60%, #b3ddfb 100%)';
                    this._createClouds(container, true);
                }

                if (this._mode === 'rain' || this._mode === 'thunderstorm') {
                    sky.style.background = 'linear-gradient(180deg,#7a8b95 0%, #6b7d86 60%, #5c6f78 100%)';
                    const dim = document.createElement('div'); dim.className = 'wa-layer wa-dim'; container.appendChild(dim);
                    // add canvas for rain
                    const canvas = document.createElement('canvas'); canvas.id = this.canvasId; container.appendChild(canvas);
                }

                if (this._mode === 'snow') {
                    sky.style.background = 'linear-gradient(180deg,#dbeaf6 0%, #cfe8f9 60%, #c3def3 100%)';
                    const canvas = document.createElement('canvas'); canvas.id = this.canvasId; container.appendChild(canvas);
                }

                if (this._mode === 'thunderstorm') {
                    const flash = document.createElement('div'); flash.className = 'wa-layer wa-flash'; container.appendChild(flash);
                }

                document.body.insertBefore(container, document.body.firstChild);

                // Start mode-specific animations
                if (this._mode === 'rain') this._startRain();
                else if (this._mode === 'snow') this._startSnow();
                else if (this._mode === 'thunderstorm') this._startThunder();
                else if (this._mode === 'clouds') this._startClouds();
                else if (this._mode === 'clear' && this._timeOfDay !== 'night') this._startClouds();

            } catch (e) {
                console.error('loadWeatherBackground error', e);
            }
        }

        _createClouds(container, layered=false) {
            // create 3 cloud layers
            for (let i=0;i<3;i++){
                const c = document.createElement('div');
                c.className = `wa-cloud layer-${i+1}`;
                c.style.left = `${-30 - i*10}%`;
                c.style.top = `${10 + i*12}%`;
                c.style.transform = `translateX(0)`;
                container.appendChild(c);
            }
        }

        _createStars(container) {
            const count = 60;
            for (let i=0;i<count;i++){
                const s = document.createElement('div'); s.className='wa-star';
                s.style.left = `${Math.random()*100}%`;
                s.style.top = `${Math.random()*60}%`;
                s.style.animationDelay = `${Math.random()*4}s`;
                s.style.transform = `scale(${0.5+Math.random()*1.5})`;
                container.appendChild(s);
            }
        }

        _startClouds() {
            // CSS animation handles clouds movement
            // nothing required in JS for this lightweight effect
        }

        _startRain() {
            const canvas = document.getElementById(this.canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const resize = () => {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.floor(canvas.clientWidth * dpr);
                canvas.height = Math.floor(canvas.clientHeight * dpr);
                ctx.scale(dpr, dpr);
            };
            resize();
            window.addEventListener('resize', resize);

            // create raindrops
            const drops = [];
            const W = canvas.clientWidth; const H = canvas.clientHeight;
            const count = Math.floor((W*H)/8000);
            for (let i=0;i<count;i++){
                drops.push({ x: Math.random()*W, y: Math.random()*H, len: 10+Math.random()*20, vy: 400+Math.random()*600, alpha: 0.2+Math.random()*0.5 });
            }

            const tick = (now)=>{
                ctx.clearRect(0,0,canvas.width,canvas.height);
                ctx.lineWidth = 1;
                ctx.strokeStyle = 'rgba(200,210,230,0.6)';
                for (const d of drops){
                    d.y += d.vy * 0.016;
                    d.x += (d.vy*0.002)*0.016;
                    if (d.y > H + d.len) { d.y = -10-Math.random()*100; d.x = Math.random()*W; }
                    ctx.globalAlpha = d.alpha;
                    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x-2, d.y+d.len); ctx.stroke();
                }
                this._animFrame = requestAnimationFrame(tick);
            };
            this._animFrame = requestAnimationFrame(tick);
        }

        _startSnow() {
            const canvas = document.getElementById(this.canvasId);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            const resize = () => {
                const dpr = window.devicePixelRatio || 1;
                canvas.width = Math.floor(canvas.clientWidth * dpr);
                canvas.height = Math.floor(canvas.clientHeight * dpr);
                ctx.scale(dpr, dpr);
            };
            resize();
            window.addEventListener('resize', resize);

            const flakes = [];
            const W = canvas.clientWidth; const H = canvas.clientHeight;
            const count = Math.floor((W*H)/16000)+40;
            for (let i=0;i<count;i++){
                flakes.push({ x: Math.random()*W, y: Math.random()*H, r: 1+Math.random()*3, vy: 10+Math.random()*40, vx: -10+Math.random()*20, alpha: 0.6+Math.random()*0.4 });
            }

            const tick = (now)=>{
                ctx.clearRect(0,0,canvas.width,canvas.height);
                for (const f of flakes){
                    f.y += f.vy * 0.016;
                    f.x += f.vx * 0.016;
                    if (f.y > H + f.r) { f.y = -10-Math.random()*50; f.x = Math.random()*W; }
                    ctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
                    ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, Math.PI*2); ctx.fill();
                }
                this._animFrame = requestAnimationFrame(tick);
            };
            this._animFrame = requestAnimationFrame(tick);
        }

        _startThunder() {
            // reuse rain but add occasional flash
            this._startRain();
            const flashEl = document.querySelector(`#${this.containerId} .wa-flash`);
            if (!flashEl) return;
            let next = 2000 + Math.random()*5000;
            const doFlash = ()=>{
                flashEl.style.background = 'rgba(255,255,255,0.18)';
                setTimeout(()=>{ flashEl.style.background = 'rgba(255,255,255,0)'; }, 90);
                next = 3000 + Math.random()*8000;
                setTimeout(doFlash, next);
            };
            setTimeout(doFlash, next);
        }
    }

    if (typeof window !== 'undefined') {
        window.WeatherAnimations = new WeatherAnimations();
    }
})();
