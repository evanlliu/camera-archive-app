# 场景相机

这是一个适合 iPhone Safari「添加到主屏幕」使用的 PWA 相机应用。

照片保存策略：

1. 拍照后先写入本机 IndexedDB，本地保存成功后才进入同步队列。
2. 点击同步后，前端把照片发给 Cloudflare Worker。
3. Cloudflare Worker 使用 Secret 中的 GitHub Token 写入 GitHub 私有仓库。
4. 同步失败不会删除本地照片，照片会继续保留在待同步队列。
5. 可以导出 ZIP 作为额外备份，也可以从 ZIP 导入恢复。

## 文件结构

这个包已经整理成单层结构，可以直接上传到 GitHub 前端仓库根目录：

```text
index.html                 前端入口，必须在仓库根目录
app.js                     前端主逻辑
styles.css                 前端样式
sw.js                      PWA 离线缓存
manifest.webmanifest       PWA 配置
icons/                     App 图标
.nojekyll                  让 GitHub Pages 按静态文件发布
cloudflare-worker.js       Cloudflare Worker 代码备份，复制到 Cloudflare Edit code 部署
wrangler.toml              可选，Wrangler 部署参考
worker-package.json        可选，Wrangler package.json 参考
README.md                  本说明
```

## GitHub 仓库建议

建议使用两个仓库：

```text
camera-archive-app          Public，放本项目全部前端代码和 cloudflare-worker.js 备份
camera-archive-private      Private，只放照片、folders.json 和照片 metadata
```

`camera-archive-private` 必须是 Private。

## GitHub Pages 部署

把本包里的所有文件上传到 `camera-archive-app` 仓库根目录。

正确结构应该是：

```text
camera-archive-app/
├── index.html
├── app.js
├── styles.css
├── sw.js
├── manifest.webmanifest
├── icons/
├── .nojekyll
├── cloudflare-worker.js
├── wrangler.toml
├── worker-package.json
└── README.md
```

不要上传成：

```text
camera-archive-app/camera-archive-app/index.html
```

也不要把 `app.js` 的内容放进 `index.html`。

进入仓库：

```text
Settings → Pages → Deploy from a branch → main / root → Save
```

前端地址类似：

```text
https://evanlliu.github.io/camera-archive-app/
```

## Cloudflare Worker 部署

进入 Cloudflare：

```text
Workers & Pages → camera-archive-data-worker → Edit code
```

把 `cloudflare-worker.js` 的全部内容复制进去，然后点击：

```text
Save and deploy
```

Worker 根地址打开后应该返回：

```json
{"ok":true,"service":"scene-camera-worker"}
```

## Cloudflare 变量

Plaintext：

```text
CORS_ORIGIN=https://evanlliu.github.io
GITHUB_BRANCH=main
GITHUB_OWNER=evanlliu
GITHUB_REPO=camera-archive-private
MAX_UPLOAD_MB=50
```

Secrets：

```text
APP_PASSWORD
GITHUB_TOKEN
```

`GITHUB_TOKEN` 建议使用 fine-grained token，只给 `camera-archive-private` 仓库 `Contents: Read and write` 权限。

## App 设置

打开网页 App 后进入「设置」：

```text
Cloudflare Worker 地址：https://你的-worker.workers.dev
App 密码：Cloudflare Secret 里的 APP_PASSWORD
```

然后点击「测试连接」。测试通过后再点击「同步」。

## 更新代码时的注意事项

更新 GitHub Pages 代码不会删除本地照片，因为照片在 Safari 的 IndexedDB 里。

不要做这些操作：

```text
不要清 Safari 网站数据
不要删除站点数据
不要改前端域名
不要随便修改 app.js 里的 DB_NAME
```

建议定期点击「导出 ZIP」，把备份保存到 iCloud Drive 或文件 App。


## v1.2 修复说明

- 设置里的“测试连接”现在会额外调用 `/write-check`，确认 GitHub Token 不只是能读取仓库，也能写入仓库。
- “测试连接”成功后会自动保存当前 Worker 地址和 App 密码，避免测试成功但同步仍使用旧地址。
- 同步分类失败时会显示更明确的错误信息。

Cloudflare Worker 更新时，复制根目录的 `cloudflare-worker.js` 到 Cloudflare 的 Edit code 后 Save and deploy。

GitHub Pages 更新时，把本目录全部文件上传到 `camera-archive-app` 仓库根目录。
