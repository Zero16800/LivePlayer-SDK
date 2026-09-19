# LivePlayer

浏览器端 HTTP-FLV 直播播放器 SDK，基于 mpegts.js，低延迟播放。

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
    new LivePlayer({
      container: '#player',
      url: 'http://your-domain/live/stream.flv',
      onLatency: ms => console.log('延迟:', ms + 'ms')
    }).play();
  </script>
</body>
</html>
```

## API

### `new LivePlayer(options)`

| 参数 | 类型 | 说明 |
|------|------|------|
| `container` | string / HTMLElement | 播放器容器 |
| `url` | string | HTTP-FLV 地址 |
| `onLatency` | function | 延迟回调（毫秒） |

### `player.play(url?)`

开始播放。

### `player.pause()`

暂停。

### `player.resume()`

恢复。

### `player.getLatency()`

获取当前延迟（毫秒）。

### `player.destroy()`

销毁播放器。

## 浏览器兼容

Chrome 65+ / Firefox 60+ / Safari 11+ / Edge 79+

## 延迟说明

典型延迟 300-500ms，取决于服务器推流和网络质量。

## 构建

```bash
npm install
npm run build
```

输出：`dist/liveplayer.js`

## License

MIT
