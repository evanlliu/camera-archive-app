# 场景相机前端

这是纯静态 PWA，直接放到 GitHub Pages 即可。

部署后，打开网页：
1. 在 Safari 中访问 GitHub Pages 地址。
2. 分享按钮 → 添加到主屏幕。
3. 第一次打开后进入“设置”，填写 Cloudflare Worker 地址和 App 密码。

照片会先保存到 IndexedDB，再同步到 Worker/GitHub。不要把 Safari 网站数据当唯一备份；请定期导出 ZIP。

## 文件说明

这个仓库采用扁平结构：

- `index.html` / `app.js` / `styles.css` / `sw.js` / `manifest.webmanifest` / `icons/`：GitHub Pages 前端代码
- `cloudflare-worker.js`：Cloudflare Worker 代码备份；复制它的全部内容到 Cloudflare Workers 的 `Edit code` 里部署
- `wrangler.toml` / `worker-package.json`：可选，仅用于本地 Wrangler 部署参考

## GitHub Pages 上传注意

`index.html` 必须放在仓库根目录，不要把 `app.js` 的内容放进 `index.html`。

## Cloudflare Worker 环境变量

Plaintext:

- `CORS_ORIGIN=https://evanlliu.github.io`
- `GITHUB_BRANCH=main`
- `GITHUB_OWNER=evanlliu`
- `GITHUB_REPO=camera-archive-private`
- `MAX_UPLOAD_MB=50`

Secrets:

- `APP_PASSWORD`
- `GITHUB_TOKEN`

