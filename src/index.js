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
    this._stopMonitor();
    this.video = document.createElement('video');
    this.video.autoplay = this.autoplay;
    this.video.muted = this.muted;
    this.video.playsinline = true;
    this.video.controls = false;
    this.video.style.cssText = 'width:1280px;max-width:100%;height:720px;background:#000;border-radius:8px;';
    const styleId = 'liveplayer-style';
    if (!document.getElementById(styleId)) {
      const s = document.createElement('style');
      s.id = styleId;
      s.textContent = 'video::-webkit-media-controls { display:none !important; } video::--webkit-media-controls-enclosure { display:none !important; }';
      document.head.appendChild(s);
    }

    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;
    if (container) container.appendChild(this.video);
  }

  _bindEvents() {
    if (!this.video) return;
    const events = ['play','pause','ended','waiting','playing','seeking','seeked','volumechange','fullscreenchange','error'];
    events.forEach(evt => {
      this.video.addEventListener(evt, () => this._emit(evt));
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
