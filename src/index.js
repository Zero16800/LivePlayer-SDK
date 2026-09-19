import LivePlayer from './core/player.js';

// v1 兼容：window.LivePlayer 全局导出
if (typeof window !== 'undefined') {
  window.LivePlayer = LivePlayer;
}

export default LivePlayer;
