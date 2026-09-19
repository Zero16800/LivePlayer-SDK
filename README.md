# LivePlayer v2.0 — 统一直播/点播播放器

一个基于 **mpegts.js / hls.js / dash.js / 原生 video** 封装的统一播放器 SDK。
一套 API 通吃 **FLV / HLS / DASH / MP4**，直播点播都支持，带自动重连和延迟监控。

## 功能特性

| 能力 | 说明 |
|---|---|
| 🎬 多格式 | FLV（mpegts.js）、HLS（hls.js）、DASH（dash.js）、MP4/WebM/Ogg（原生 video） |
| 🔀 格式自动识别 | 按 URL 后缀自动识别，也支持显式 `type` 指定 |
| ⚡ 引擎懒加载 | 用到哪个格式才动态加载对应引擎，首包体积小 |
| 🔁 自动重连 | 直播断流自动指数退避重连（可配次数/延迟） |
| 📊 延迟监控 | 直播缓冲延迟每秒上报（`latency` 事件） |
| 🎯 统一 API | `play / pause / resume / seek / destroy` 一套接口全格式通用 |
| 📡 事件系统 | `error / reconnect / statechange / latency / stats` 等完整事件 |
| 🏷️ 统一错误码 | 格式不支持、引擎不支持、网络错误、解码错误等分类清晰 |
| 📦 UMD 全局导出 | 浏览器 `<script>` 直接 `window.LivePlayer` 可用 |

## 支持的格式

| 格式 | 引擎 | 直播 | 点播 | 说明 |
|---|---|---|---|---|
| FLV | mpegts.js | ✅ | ✅ | 也支持 f4v / ts 流 |
| HLS | hls.js | ✅ | ✅ | m3u8 直播/点播 |
| DASH | dash.js | ✅ | ✅ | mpd 清单 |
| MP4 | 原生 video | ❌ | ✅ | 含 webm/ogg，原生不支持直播 |

## 目录结构

```
live-sdk/
├── src/
│   ├── index.js              # 入口（UMD 全局导出）
│   ├── core/
│   │   └── player.js         # Player 核心（生命周期/重连/事件/延迟监控）
│   ├── engines/              # 引擎适配层（懒加载）
│   │   ├── flv.js            # mpegts.js 适配
│   │   ├── hls.js            # hls.js 适配
│   │   ├── dash.js           # dash.js 适配
│   │   └── mp4.js            # 原生 video 适配
│   └── utils/
│       ├── events.js         # 事件发射器
│       ├── errors.js         # 错误码 + PlayerError
│       └── format.js         # 格式识别
└── demo.html                 # 演示页面
```

## 快速开始

### 安装

```bash
npm install
```

### 浏览器直接引入（构建后）

```html
<script src="dist/live-player.min.js"></script>
<script>
  const player = new LivePlayer({
    container: '#video',
    url: 'https://example.com/live/stream.flv',
    isLive: true,
    autoplay: true,
  });
  player.play();
</script>
```

### ES Module

```js
import LivePlayer from './src/index.js';

const player = new LivePlayer({
  container: document.querySelector('#video'),
  url: 'https://example.com/live/stream.flv',
  autoplay: true,
});

player.on('error', (err) => console.error('播放出错:', err.code, err.message));
player.play();
```

## API 文档

### `new LivePlayer(options)`

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `container` | string \| HTMLElement | — | 容器选择器或元素，video 会挂载进去 |
| `url` | string | `''` | 流地址（可在 `play()` 时再传） |
| `type` | string | 自动识别 | 显式格式：`flv` / `hls` / `dash` / `mp4` |
| `autoplay` | boolean | `true` | 自动播放（可能被浏览器拦截，见注意事项） |
| `muted` | boolean | `false` | 初始静音（静音可绕过自动播放拦截） |
| `controls` | boolean | `true` | 是否显示原生控制条 |
| `isLive` | boolean | 自动判断 | 是否直播（mp4 默认点播，其余默认直播） |
| `style` | string | `''` | 附加到 video 元素的 CSS |
| `enableWorker` | boolean | `true` | 引擎启用 Worker 解码 |
| `enableStashBuffer` | boolean | `true` | FLV 缓冲（直播建议 false 降延迟） |
| `stashInitialSize` | number | `64` | FLV 初始缓冲大小（KB） |
| `liveBufferLatencyChasing` | boolean | `true` | FLV 直播追帧 |
| `liveBufferLatencyMaxLatency` | number | `0.5` | FLV 最大延迟（秒） |
| `lowLatencyMode` | boolean | `true` | HLS 低延迟模式 |
| `backBufferLength` | number | `90` | HLS 回看缓冲（秒） |
| `mpegtsConfig` | object | `{}` | 透传给 mpegts.js 的额外配置 |
| `hlsConfig` | object | `{}` | 透传给 hls.js 的额外配置 |
| `dashConfig` | object | `{}` | 透传给 dash.js 的额外配置 |
| `reconnect` | object | 见下 | 重连配置 |
| `onError` | function | — | 错误回调（v1 兼容） |
| `onReconnect` | function | — | 重连回调（v1 兼容） |
| `onLatency` | function | — | 延迟回调（v1 兼容） |
| `onStats` | function | — | 统计回调（v1 兼容） |

**`reconnect` 配置：**

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `maxRetries` | number | `5` | 最大重连次数 |
| `baseDelay` | number | `1000` | 首次重连延迟（毫秒） |
| `maxDelay` | number | `30000` | 重连延迟上限（毫秒） |

重连延迟按指数退避：`baseDelay * 2^n`，封顶 `maxDelay`。

### 实例方法

| 方法 | 说明 |
|---|---|
| `play(url?, opts?)` | 播放。`url` 可覆盖构造时的地址；`opts` 支持 `{ type, isLive, autoplay }`。返回 Promise |
| `pause()` | 暂停 |
| `resume()` | 恢复播放，返回 Promise |
| `seek(time)` | 跳转（点播），单位秒 |
| `getLatency()` | 获取当前直播延迟（毫秒） |
| `getVideoElement()` | 获取底层 video 元素（可操作 volume/currentTime） |
| `getState()` | 获取当前状态 |
| `getType()` | 获取当前格式 |
| `destroy()` | 销毁，释放引擎和 video 元素 |
| `on(event, handler)` | 监听事件（继承自 EventEmitter） |
| `off(event, handler)` | 移除监听 |
| `emit(event, ...args)` | 手动触发事件 |

### 状态机

```
idle → loading → playing ⇄ paused
  ↓        ↓         ↓
error ← error ← reconnecting → loading → playing
  ↓
destroyed
```

### 事件

| 事件 | 参数 | 说明 |
|---|---|---|
| `ready` | `{ type, isLive }` | 播放器就绪 |
| `statechange` | `state` | 状态变更（loading/playing/paused/reconnecting/error/destroyed） |
| `error` | `PlayerError` | 播放错误（见错误码） |
| `reconnect` | `{ attempt, delay, maxRetries }` | 开始重连 |
| `reconnected` | `{ attempt }` | 重连成功 |
| `reconnect:failed` | `{ attempts }` | 重连耗尽 |
| `latency` | `latencyMs` | 直播延迟（毫秒），每秒一次 |
| `stats` | `{ latency, currentTime, buffered }` | 播放统计，每秒一次 |
| `play` / `pause` / `ended` / `waiting` / `playing` / `seeking` / `seeked` / `volumechange` | 原生事件 | video 原生事件透传 |

### 错误码

| 错误码 | 说明 |
|---|---|
| `UNSUPPORTED_FORMAT` | 格式不支持 / URL 无法识别格式 |
| `ENGINE_NOT_SUPPORTED` | 浏览器不支持该格式引擎（如无 MSE） |
| `LOAD_ERROR` | 加载失败 |
| `NETWORK_ERROR` | 网络中断（会自动触发重连） |
| `MEDIA_ERROR` | 媒体解码错误 |
| `INVALID_ARGS` | 参数错误（如 URL 为空、容器找不到） |

```js
player.on('error', (err) => {
  console.log(err.code);    // 如 'NETWORK_ERROR'
  console.log(err.message); // 人类可读信息
  console.log(err.detail);  // 原始错误/数据
});
```

## 使用示例

### 1. FLV 直播（最常见）

```js
const player = new LivePlayer({
  container: '#video',
  url: 'https://example.com/live/stream.flv',
  isLive: true,
  autoplay: true,
  enableStashBuffer: false,      // 直播降延迟
  reconnect: { maxRetries: 5 },
});
player.play();
```

### 2. HLS 直播

```js
const player = new LivePlayer({
  container: '#video',
  url: 'https://example.com/live/stream.m3u8',
});
player.play();
```

### 3. MP4 点播

```js
const player = new LivePlayer({
  container: '#video',
  url: 'https://example.com/movie.mp4',
  autoplay: false,
});
player.play();
```

### 4. 显式指定格式

```js
// URL 没后缀（如 CDN 签名地址）时，必须显式指定
const player = new LivePlayer({
  container: '#video',
  url: 'https://example.com/live/stream?token=abc123',
  type: 'flv',
});
player.play();
```

### 5. 监听延迟并自动追帧

```js
player.on('latency', (ms) => {
  if (ms > 3000) {
    // 延迟超过 3 秒，跳到缓冲末尾追帧
    const video = player.getVideoElement();
    video.currentTime = video.buffered.end(video.buffered.length - 1) - 1;
  }
});
```

### 6. 自动重连状态展示

```js
player.on('reconnect', ({ attempt, delay }) => {
  console.log(`第 ${attempt} 次重连，${delay}ms 后重试...`);
  showTip(`网络断了，正在重连（${attempt}/5）...`);
});
player.on('reconnected', () => hideTip());
player.on('reconnect:failed', () => showTip('重连失败，请检查网络'));
```

## 注意事项

1. **自动播放会被浏览器拦截**：浏览器要求用户交互后才能有声播放。解法：
   - 设置 `muted: true` 静音自动播放，用户点击后 `video.muted = false`
   - 或等用户交互后再调 `player.play()`
2. **无后缀 URL 必须显式 `type`**：CDN 签名地址、无扩展名流地址识别不了，必须传 `type`
3. **MP4 不支持直播**：直播请用 FLV / HLS / DASH
4. **HLS 兼容性**：hls.js 需要浏览器支持 MediaSource Extension（现代浏览器都支持，Safari 走原生）

## 构建

```bash
npm run build   # webpack 打包 → dist/live-player.min.js
```

## License

MIT
