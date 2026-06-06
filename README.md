# camera-archive-app

这是场景相机 GitHub Pages 前端 + Cloudflare Worker 代码备份。

## 文件说明

```text
index.html               GitHub Pages 首页
app.js                   前端逻辑：拍照、本地 IndexedDB、云端加载、同步队列
styles.css               样式
sw.js                    PWA 缓存
manifest.webmanifest     添加到 iPhone 主屏幕配置
icons/                   图标
.nojekyll                让 GitHub Pages 原样发布静态文件
cloudflare-worker.js     Cloudflare Worker 代码，复制到 Worker 的 Edit code
README.md                本说明
```

## 本版本新增：默认云端加载

本版本会在 App 启动后，如果已经保存了 Worker 地址和 App 密码，就自动执行：

```text
1. 从 Cloudflare Worker 读取 GitHub 私有仓库 camera-archive-private
2. 加载 folders.json 里的分类
3. 扫描 photos/ 里的每张照片 metadata
4. 下载云端照片到本机 IndexedDB
5. 保留本机未同步照片，不会覆盖或删除
6. 同步时先拉取云端，再上传本地 pending / failed / cloudMissing 队列
```

这样不同设备打开 App 时，会默认以 GitHub 私有仓库中的数据为基础进行同步。

## 部署前端

把本目录里的文件全部上传到 GitHub 前端仓库根目录，例如：

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
└── README.md
```

然后开启：

```text
Settings → Pages → Deploy from a branch → main → / root
```

访问地址一般是：

```text
https://evanlliu.github.io/camera-archive-app/
```

## 部署 Cloudflare Worker

打开 Cloudflare：

```text
Workers & Pages → camera-archive-data-worker → Edit code
```

复制 `cloudflare-worker.js` 的全部内容，覆盖 Worker 代码，然后点击：

```text
Save and deploy
```

Worker 变量保持：

```text
APP_PASSWORD       Secret
GITHUB_TOKEN       Secret
CORS_ORIGIN        https://evanlliu.github.io
GITHUB_BRANCH      main
GITHUB_OWNER       evanlliu
GITHUB_REPO        camera-archive-private
MAX_UPLOAD_MB      50
```

`CORS_ORIGIN` 不要加 `/camera-archive-app`，浏览器 Origin 只有域名。

## 使用顺序

```text
1. 更新 GitHub Pages 前端文件
2. 更新 Cloudflare Worker 代码
3. 打开 App → 设置
4. 填 Worker 地址和 App 密码
5. 点击“测试连接并读取云端”
6. 成功后保存
7. 重新打开 App，会默认先加载云端数据
```

## 数据安全原则

- 拍照后先写入本机 IndexedDB，再进入上传队列。
- 云端加载不会覆盖本机 pending / deletePending 照片。
- 云端索引缺失时不会自动删除本机照片，会标记为 `cloudMissing` 并保留本机副本。
- 删除照片时 Worker 会写入 `deletions/` tombstone，其他设备拉取云端时可以同步删除状态，但本地副本仍保留在回收站状态。
- 仍建议定期导出 ZIP，作为 GitHub 之外的第二份备份。

## v3 按钮修复说明

- 移动端按钮显式设置 `type=button`，避免表单默认行为影响点击。
- 每次打开时改为后台加载云端，不再锁住拍照/同步/导出按钮。
- `sw.js` 改为核心文件网络优先，减少旧缓存导致的按钮失效。
- 网络请求增加超时和更清楚的错误提示。
