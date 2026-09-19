# LivePlayer

浏览器端直播/点播播放器 SDK。支持 FLV、HLS、MP4，低延迟，自动重连。

## 安装

```html
<script src="dist/liveplayer.js"></script>
```

## 快速开始

```html
<div id="player"></div>
<script src="dist/liveplayer.js"></script>
<script>
  new LivePlayer({
    container: '#player',
    url: 'http://your-domain/live/stream.flv',
    onLatency: ms => console.log('延迟:', ms + 'ms')
  }).play();
</script>
```

## 支持格式

| 格式 | 引擎 | 直播 | 点播 |
|------|------|------|------|
| FLV / TS | mpegts.js | ✅ | ✅ |
| HLS (m3u8) | hls.js / 原生 | ✅ | ✅ |
| MP4 / WebM | 原生 video | ❌ | ✅ |

## API

### `new LivePlayer(options)`

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `container` | string / HTMLElement | — | 播放器容器 |
| `url` | string | — | 流地址 |
| `type` | string | 自动识别 | 显式格式：`flv` / `hls` / `mp4` |
| `isLive` | boolean | `true` | 是否直播 |
| `autoplay` | boolean | `true` | 自动播放 |
| `muted` | boolean | `false` | 静音 |
| `controls` | boolean | `true` | 显示控制条 |
| `enableWorker` | boolean | `true` | Worker 解码 |
| `reconnect` | object | `{maxRetries:5, baseDelay:1000, maxDelay:30000}` | 重连配置 |
| `onLatency` | function | — | 延迟回调 |

### 方法

| 方法 | 说明 |
|------|------|
| `play(url?)` | 播放 |
| `pause()` | 暂停 |
| `resume()` | 恢复 |
| `seek(time)` | 跳转（秒） |
| `destroy()` | 销毁 |
| `getLatency()` | 获取延迟（ms） |
| `getState()` | 获取状态 |
| `getVideoElement()` | 获取 video 元素 |
| `setVolume(v)` | 设置音量 0-1 |
| `getVolume()` | 获取音量 |
| `setMuted(m)` | 静音 |
| `isMuted()` | 是否静音 |
| `toggleFullscreen()` | 全屏切换 |
| `on(event, handler)` | 监听事件 |
| `off(event, handler)` | 移除监听 |

### 事件

| 事件 | 说明 |
|------|------|
| `ready` | 播放器就绪 |
| `statechange` | 状态变更 |
| `error` | 播放错误 |
| `reconnect` | 开始重连 |
| `reconnected` | 重连成功 |
| `reconnect:failed` | 重连耗尽 |
| `latency` | 直播延迟（ms） |
| `stats` | 播放统计 |

### 状态

```
idle → loading → playing ⇄ paused
  ↓        ↓         ↓
error ← error ← reconnecting → loading → playing
```

## 示例

### FLV 直播
```js
new LivePlayer({ container: '#v', url: 'http://xxx/live.flv' }).play();
```

### HLS 直播
```js
new LivePlayer({ container: '#v', url: 'http://xxx/live.m3u8' }).play();
```

### MP4 点播
```js
new LivePlayer({ container: '#v', url: 'http://xxx/video.mp4', isLive: false }).play();
```

### 多实例
```js
const p1 = new LivePlayer({ container: '#v1', url: 'http://xxx/a.flv' }).play();
const p2 = new LivePlayer({ container: '#v2', url: 'http://xxx/b.flv' }).play();
```

### 监听延迟
```js
const player = new LivePlayer({ container: '#v', url: 'http://xxx/live.flv' });
player.on('latency', ms => console.log('延迟:', ms + 'ms'));
player.play();
```

## 浏览器兼容

Chrome 65+ / Firefox 60+ / Safari 11+ / Edge 79+

## 构建

```bash
npm install
npm run build
```

输出：`dist/liveplayer.js`

## License

MIT
