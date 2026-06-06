# camera-archive-app 前端仓库

这是 GitHub Pages 前端代码，建议放在公开仓库：

```text
camera-archive-app
```

部署后访问地址：

```text
https://evanlliu.github.io/camera-archive-app/
```

照片不要放在这个仓库。照片数据仓库仍然是私有仓库：

```text
camera-archive-private
```

Cloudflare Worker 的 `CORS_ORIGIN` 仍然填写：

```text
https://evanlliu.github.io
```

不要填写 `https://evanlliu.github.io/camera-archive-app`，因为浏览器请求头里的 Origin 只有域名，没有路径。

## 上传方式

把本目录里的文件全部上传到 `camera-archive-app` 仓库根目录：

```text
index.html
app.js
styles.css
sw.js
manifest.webmanifest
icons/
.nojekyll
```

然后在仓库里开启：

```text
Settings → Pages → Deploy from a branch → main → / root
```
