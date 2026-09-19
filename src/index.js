import mpegts from 'mpegts.js';

class LivePlayer {
  constructor(options = {}) {
    this.url = options.url || '';
    this.container = options.container || null;
    this.video = null;
    this.player = null;
    this.latency = 0;
    this.onLatency = options.onLatency || null;
  }

  play(url) {
    if (url) this.url = url;
    if (!this.url) throw new Error('URL is required');
    if (!mpegts.isSupported()) throw new Error('Browser not supported');

    this.destroy();

    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsinline = true;
    this.video.style.cssText = 'width:100%;max-width:100%;background:#000;border-radius:8px';

    const container = typeof this.container === 'string'
      ? document.querySelector(this.container)
      : this.container;
    if (container) container.appendChild(this.video);

    this.player = mpegts.createPlayer(
      { type: 'flv', isLive: true, url: this.url },
      {
        enableWorker: true,
        enableStashBuffer: false,
        stashInitialSize: 64,
        liveBufferLatencyChasing: true,
        liveBufferLatencyMaxLatency: 0.5
      }
    );

    this.player.attachMediaElement(this.video);
    this.player.load();
    this.video.play();

    this._startLatencyMonitor();
    return this;
  }

  _startLatencyMonitor() {
    this._timer = setInterval(() => {
      if (this.video && this.video.buffered.length > 0) {
        this.latency = Math.round(
          (this.video.buffered.end(this.video.buffered.length - 1) - this.video.currentTime) * 1000
        );
        if (this.onLatency) this.onLatency(this.latency);
      }
    }, 1000);
  }

  getLatency() {
    return this.latency;
  }

  pause() {
    if (this.video) this.video.pause();
  }

  resume() {
    if (this.video) this.video.play();
  }

  destroy() {
    if (this._timer) clearInterval(this._timer);
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
  }
}

if (typeof window !== 'undefined') {
  window.LivePlayer = LivePlayer;
}

export default LivePlayer;
