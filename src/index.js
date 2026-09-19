import mpegts from 'mpegts.js';

class LivePlayer {
  static _id = 0;

  constructor(options = {}) {
    this._id = ++LivePlayer._id;
    this.url = options.url || '';
    this.container = options.container || null;
    this.type = options.type || null;
    this.isLive = options.isLive !== false;
    this.autoplay = options.autoplay !== false;
    this.muted = options.muted !== undefined ? options.muted : true;
    this.controls = options.controls !== false;
    this.enableWorker = options.enableWorker !== false;

    this.video = null;
    this.player = null;
    this.latency = 0;
    this.state = 'idle';
    this._timer = null;
    this._reconnectTimer = null;
    this._reconnectCount = 0;
    this._reconnectMax = options.reconnect?.maxRetries ?? 5;
    this._reconnectDelay = options.reconnect?.baseDelay ?? 1000;
    this._reconnectMaxDelay = options.reconnect?.maxDelay ?? 30000;
    this._events = {};
    this._destroyed = false;
  }

  on(event, handler) {
    if (!this._events[event]) this._events[event] = [];
    this._events[event].push(handler);
    return this;
  }

  off(event, handler) {
    if (!this._events[event]) return this;
    if (handler) {
      this._events[event] = this._events[event].filter(h => h !== handler);
    } else {
      delete this._events[event];
    }
    return this;
  }

  _emit(event, ...args) {
    (this._events[event] || []).forEach(h => {
      try { h(...args); } catch (e) { console.error(e); }
    });
  }

  _setState(state) {
    if (this.state === state) return;
    this.state = state;
    this._emit('statechange', state);
  }

  _detectType(url) {
    if (this.type) return this.type;
    const ext = url.split('?')[0].split('.').pop().toLowerCase();
    if (ext === 'flv' || ext === 'ts') return 'flv';
    if (ext === 'm3u8') return 'hls';
    if (ext === 'mpd') return 'dash';
    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) return 'mp4';
    return 'flv';
  }

  async play(url, opts = {}) {
    if (url) this.url = url;
    if (opts.type) this.type = opts.type;
    if (opts.isLive !== undefined) this.isLive = opts.isLive;
    if (!this.url) throw new Error('URL is required');

    this._destroyed = false;
    this._reconnectCount = 0;
    const type = this._detectType(this.url);

    this._emit('ready', { type, isLive: this.isLive });
    this._setState('loading');

    try {
      if (type === 'flv') {
        await this._playFLV();
      } else if (type === 'hls') {
        await this._playHLS();
      } else if (type === 'dash') {
        await this._playDASH();
      } else if (type === 'mp4') {
        await this._playNative();
      } else {
        throw new Error('Unsupported format: ' + type);
      }
    } catch (e) {
      this._emit('error', e);
      this._tryReconnect();
    }
  }

  async _playFLV() {
    if (!mpegts.isSupported()) throw new Error('MSE not supported');
    this._createVideo();
    this.player = mpegts.createPlayer(
      { type: 'flv', isLive: this.isLive, url: this.url },
      {
        enableWorker: this.enableWorker,
        enableStashBuffer: true,
        stashInitialSize: 32,
        lazyLoadMaxDuration: 0.3,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 0.5,
        liveBufferLatencyChasingOnPaused: true
      }
    );
    this.player.attachMediaElement(this.video);
    this.player.load();
    this._startMonitor();
    this._bindEvents();
    try { await this.video.play(); } catch (e) {}
    this._setState('playing');
  }

  async _playHLS() {
    this._createVideo();
    if (this.video.canPlayType('application/vnd.apple.mpegurl')) {
      this.video.src = this.url;
      this._startMonitor();
      this._bindEvents();
      try { await this.video.play(); } catch (e) {}
      this._setState('playing');
      return;
    }
    if (typeof window.Hls === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/hls.js@latest';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load hls.js'));
        document.head.appendChild(s);
      });
    }
    if (!window.Hls.isSupported()) throw new Error('HLS not supported');
    const hls = new window.Hls({ lowLatencyMode: true, backBufferLength: 90 });
    this._hls = hls;
    hls.loadSource(this.url);
    hls.attachMedia(this.video);
    hls.on(window.Hls.Events.MANIFEST_PARSED, () => this.video.play());
    hls.on(window.Hls.Events.ERROR, (e, data) => {
      if (data.fatal) {
        this._emit('error', new Error(data.type + ': ' + data.details));
        this._tryReconnect();
      }
    });
    this._startMonitor();
    this._bindEvents();
    this._setState('playing');
  }

  async _playNative() {
    this._createVideo();
    this.video.src = this.url;
    this._startMonitor();
    this._bindEvents();
    try { await this.video.play(); } catch (e) {}
    this._setState('playing');
  }

  async _playDASH() {
    this._createVideo();
    if (typeof window.dashjs === 'undefined') {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.dashjs.org/latest/dash.all.min.js';
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load dash.js'));
        document.head.appendChild(s);
      });
    }
    const player = window.dashjs.MediaPlayer().create();
    this._dash = player;
    player.initialize(this.video, this.url, this.autoplay);
    this._startMonitor();
    this._bindEvents();
    this._setState('playing');
  }

  _createVideo() {
    if (this.player) {
      try { this.player.pause(); this.player.unload(); this.player.detachMediaElement(); } catch (e) {}
      this.player = null;
    }
    if (this._hls) { try { this._hls.destroy(); } catch (e) {} this._hls = null; }
    if (this._dash) { try { this._dash.reset(); } catch (e) {} this._dash = null; }
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this.video) { this.video.src = ''; this.video.load(); }
    if (this.controlsEl) { this.controlsEl.remove(); this.controlsEl = null; }
    this._stopMonitor();

    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;
    if (!container) return;

    this.video = document.createElement('video');
    this.video.autoplay = this.autoplay;
    this.video.muted = this.muted;
    this.video.playsinline = true;
    this.video.controls = false;
    this.video.style.cssText = 'width:1280px;max-width:100%;height:720px;background:#000;border-radius:8px;display:block;';
    container.appendChild(this.video);

    if (this.controls) this._createControls(container);
  }

  _createControls(container) {
    const css = `#lp-ctrl-${this._id}{position:relative;width:100%;margin-top:-40px;z-index:10;display:flex;align-items:center;gap:6px;padding:6px 12px;background:linear-gradient(transparent,rgba(0,0,0,.85));border-radius:0 0 8px 8px;font-family:sans-serif;color:#fff;font-size:13px;box-sizing:border-box;user-select:none}
#lp-ctrl-${this._id} button{background:none;border:none;color:#fff;cursor:pointer;font-size:16px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:4px}
#lp-ctrl-${this._id} button:hover{background:rgba(255,255,255,.2)}
#lp-ctrl-${this._id} .lp-progress{flex:1;height:4px;background:rgba(255,255,255,.3);border-radius:2px;cursor:pointer;position:relative}
#lp-ctrl-${this._id} .lp-progress-fill{height:100%;background:#00aaff;border-radius:2px;width:0%}
#lp-ctrl-${this._id} .lp-time{min-width:80px;text-align:center}
#lp-ctrl-${this._id} input[type=range]{width:60px;accent-color:#00aaff}`;
    if (!document.getElementById('lp-ctrl-style')) {
      const s = document.createElement('style'); s.id = 'lp-ctrl-style'; s.textContent = css; document.head.appendChild(s);
    }

    const ctrl = document.createElement('div');
    ctrl.id = `lp-ctrl-${this._id}`;

    const playBtn = document.createElement('button');
    playBtn.textContent = '⏸';

    const progress = document.createElement('div');
    progress.className = 'lp-progress';
    const fill = document.createElement('div');
    fill.className = 'lp-progress-fill';
    progress.appendChild(fill);

    const time = document.createElement('span');
    time.className = 'lp-time';
    time.textContent = '00:00';

    const vol = document.createElement('input');
    vol.type = 'range'; vol.min = 0; vol.max = 1; vol.step = 0.1;
    vol.value = this.muted ? 0 : this.video.volume;

    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.textContent = '⛶';

    playBtn.onclick = () => {
      if (this.video.paused) { this.video.play(); playBtn.textContent = '⏸'; }
      else { this.video.pause(); playBtn.textContent = '▶'; }
    };
    this.video.addEventListener('play', () => playBtn.textContent = '⏸');
    this.video.addEventListener('pause', () => playBtn.textContent = '▶');

    progress.onclick = (e) => {
      const r = progress.getBoundingClientRect();
      this.video.currentTime = ((e.clientX - r.left) / r.width) * this.video.duration;
    };
    this.video.addEventListener('timeupdate', () => {
      const dur = this.video.duration;
      const ct = this.video.currentTime;
      if (!isFinite(dur) || dur <= 0) {
        time.textContent = 'LIVE';
        fill.style.width = '100%';
        return;
      }
      fill.style.width = (ct / dur * 100) + '%';
      time.textContent = `${this._fmtTime(ct)} / ${this._fmtTime(dur)}`;
    });

    vol.oninput = () => { this.video.volume = vol.value; this.video.muted = vol.value == 0; };

    fullscreenBtn.onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else container.requestFullscreen();
    };

    ctrl.append(playBtn, progress, time, vol, fullscreenBtn);
    container.appendChild(ctrl);
    this.controlsEl = ctrl;

    if (this.isLive) {
      progress.style.display = 'none';
      time.textContent = 'LIVE';
      time.style.color = '#ff4444';
    }
  }

  _fmtTime(s) {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  _bindEvents() {
    if (!this.video) return;
    const events = ['play','pause','ended','waiting','playing','seeking','seeked','volumechange','fullscreenchange','error'];
    events.forEach(evt => {
      this.video.addEventListener(evt, (e) => this._emit(evt, e));
    });
    this.video.addEventListener('playing', () => {
      this._reconnectCount = 0;
      this._setState('playing');
    });
    this.video.addEventListener('error', () => {
      if (!this._destroyed) {
        this._emit('error', new Error('Media error'));
        this._tryReconnect();
      }
    });
  }

  _startMonitor() {
    console.log('[LivePlayer] _startMonitor called');
    this._stopMonitor();
    this._timer = setInterval(() => {
      if (this._destroyed || !this.video) return;

      const ct = this.video.currentTime;
      const buf = this.video.buffered;
      let liveEdge = 0;
      let bufLen = buf ? buf.length : 0;
      if (bufLen > 0) {
        liveEdge = buf.end(bufLen - 1);
      }

      let latency = 0;
      if (liveEdge > 0 && ct > 0) {
        latency = Math.round((liveEdge - ct) * 1000);
      }

      console.log('[LivePlayer] ct=' + ct.toFixed(2) + ' bufLen=' + bufLen + ' liveEdge=' + liveEdge.toFixed(2) + ' latency=' + latency);

      this.latency = latency;
      this._emit('latency', this.latency);
      this._emit('stats', { latency, currentTime: ct, liveEdge });
    }, 200);
  }

  _stopMonitor() {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  _tryReconnect() {
    if (this._destroyed) return;
    if (this._reconnectCount >= this._reconnectMax) {
      this._setState('error');
      this._emit('reconnect:failed', { attempts: this._reconnectCount });
      return;
    }
    const delay = Math.min(this._reconnectDelay * Math.pow(2, this._reconnectCount), this._reconnectMaxDelay);
    this._reconnectCount++;
    this._setState('reconnecting');
    this._emit('reconnect', { attempt: this._reconnectCount, delay, maxRetries: this._reconnectMax });
    this._reconnectTimer = setTimeout(() => {
      if (this._destroyed) return;
      this.play().then(() => {
        this._emit('reconnected', { attempt: this._reconnectCount });
      }).catch(() => {});
    }, delay);
  }

  getLatency() { return this.latency; }
  getState() { return this.state; }
  getVideoElement() { return this.video; }

  async toggleFullscreen() {
    if (!this.video) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await this.video.requestFullscreen();
    }
  }

  setVolume(v) { if (this.video) this.video.volume = Math.max(0, Math.min(1, v)); }
  getVolume() { return this.video ? this.video.volume : 0; }
  setMuted(m) { if (this.video) this.video.muted = m; }
  isMuted() { return this.video ? this.video.muted : false; }

  pause() { if (this.video) this.video.pause(); this._setState('paused'); }
  resume() { if (this.video) { this.video.play(); this._setState('playing'); } }
  seek(time) { if (this.video) this.video.currentTime = time; }

  destroy() {
    this._destroyed = true;
    this._stopMonitor();
    if (this._reconnectTimer) { clearTimeout(this._reconnectTimer); this._reconnectTimer = null; }
    if (this._hls) { this._hls.destroy(); this._hls = null; }
    if (this._dash) { this._dash.reset(); this._dash = null; }
    if (this.player) {
      this.player.pause();
      this.player.unload();
      this.player.detachMediaElement();
      this.player.destroy();
      this.player = null;
    }
    if (this.controlsEl) { this.controlsEl.remove(); this.controlsEl = null; }
    if (this.video && this.video.parentNode) {
      this.video.parentNode.removeChild(this.video);
      this.video = null;
    }
    this._setState('destroyed');
  }
}

if (typeof window !== 'undefined') {
  window.LivePlayer = LivePlayer;
}

export default LivePlayer;
