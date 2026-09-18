# LivePlayer

浏览器端 HTTP-FLV 直播播放器 SDK，基于 mpegts.js，支持低延迟播放。

## 安装

### CDN 引入
```html
<script src="dist/liveplayer.js"></script>
```

### npm 安装
```bash
npm install
npm run build
```

## 快速开始

```html
<!DOCTYPE html>
<html>
<head>
  <script src="dist/liveplayer.js"></script>
</head>
<body>
  <div id="player"></div>
  <script>
    const player = new LivePlayer({
      container: '#player',
      url: 'http://your-domain/live/stream.flv'
    });
    player.play();
  </script>
</body>
</html>
```

## API

### `new LivePlayer(options)`

创建播放器实例。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `container` | string / HTMLElement | 是 | 播放器容器，CSS选择器或DOM元素 |
| `url` | string | 否 | HTTP-FLV 地址，也可在 `play()` 时传入 |
| `onLatency` | function | 否 | 延迟回调，参数为毫秒数 |

### `player.play(url?)`

开始播放。可选传入 URL 覆盖构造时的地址。

```javascript
player.play('http://xxx/live/stream.flv');
```

### `player.pause()`

暂停播放。

### `player.resume()`

恢复播放。

### `player.getLatency()`

获取当前延迟（毫秒）。

```javascript
const latency = player.getLatency();
console.log('延迟:', latency + 'ms');
```

### `player.destroy()`

销毁播放器，释放资源。

## 完整示例

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>直播播放</title>
  <style>
    body { font-family: Arial; background: #1a1a2e; color: #fff; text-align: center; padding: 20px; }
    input { padding: 8px; width: 400px; border-radius: 6px; border: none; }
    button { padding: 8px 20px; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
    .play { background: #22c55e; color: #fff; }
    .stop { background: #e94560; color: #fff; }
    #status { margin: 15px 0; padding: 10px; background: #16213e; border-radius: 6px; font-family: monospace; }
  </style>
</head>
<body>
  <h2>LivePlayer</h2>
  <input id="url" placeholder="HTTP-FLV 地址">
  <button class="play" onclick="play()">播放</button>
  <button class="stop" onclick="stop()">停止</button>
  <div id="status">待命</div>
  <div id="player"></div>

  <script src="dist/liveplayer.js"></script>
  <script>
    let player;

    function play() {
      const url = document.getElementById('url').value.trim();
      if (!url) { alert('请输入地址'); return; }

      player = new LivePlayer({
        container: '#player',
        url: url,
        onLatency: ms => {
          document.getElementById('status').innerText = '延迟: ' + ms + 'ms';
        }
      });
      player.play();
    }

    function stop() {
      if (player) player.destroy();
    }
  </script>
</body>
</html>
```

## 浏览器兼容

| 浏览器 | 支持 |
|--------|------|
| Chrome 65+ | ✅ |
| Firefox 60+ | ✅ |
| Safari 11+ | ✅ |
| Edge 79+ | ✅ |

需要浏览器支持 MSE (Media Source Extensions)。

## 延迟说明

典型延迟 300-500ms，来源：

```
服务器推流 → CDN分发 → mpegts.js解析 → MSE缓冲 → 浏览器播放
```

延迟主要取决于：
1. 服务器推流间隔
2. CDN 节点距离
3. 网络质量

## 文件说明

```
live-sdk/
├── src/index.js          # SDK 源码
├── dist/liveplayer.js      # 打包文件 (272KB, 含 mpegts.js)
├── demo.html             # 演示页面
├── webpack.config.js     # 构建配置
└── package.json
```

## 重新构建

```bash
cd live-sdk
npm install
npm run build
```

输出文件：`dist/liveplayer.js`
