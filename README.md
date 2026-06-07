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

## v4 更新

- 子分类支持“改名”。改名后会同步 folders.json，历史照片文件不会自动迁移目录，避免误删/重复移动。
- 照片预览支持上一张/下一张切换，不需要关闭弹窗再打开另一张。


## v5 更新

- 图片查看弹窗支持双指捏合缩放。
- 放大后可以拖动图片查看细节。
- 支持双击图片快速放大 / 还原。
- 增加缩小、100%、放大按钮。

## v6 更新

- 照片查看页重新压缩排版，移动端尽量在一个页面内显示图片、切换、缩放、备注和操作按钮。
- 分类改名后，会把该分类及其子分类下已同步照片加入“路径迁移队列”。同步成功后，照片会上传到新的 GitHub 路径，并通过 Worker 清理旧路径，不写入删除 tombstone。
- Worker 新增 `POST /cleanup-moved-photo`，用于分类改名后的旧 GitHub 文件清理。
- 云端加载时按照片 `id` 去重，若旧路径和新路径短暂共存，会优先使用更新时间较新的 metadata。

注意：GitHub 是 Git 仓库，文件从当前目录删除后，历史提交里仍可能保留旧路径。这里的“清理旧路径”指当前仓库文件树中不再显示旧目录文件。


## v7 更新

- 照片列表中，点按缩略图会直接打开系统/Safari 图片预览页面，可使用 iOS 原生的双指缩放和拖动查看。
- 长按照片缩略图仍可打开 App 内管理弹窗，用于备注、删除、上一张/下一张等管理操作。
- App 内大图预览中，双击图片也会打开系统/Safari 图片预览页面。

说明：PWA 不能真正调用 iPhone“照片”App 的内部查看器，但可以打开 iOS/Safari 原生图片预览页面，达到全屏查看和自由缩放的效果。

## v9 更新

- 重新设计照片查看器：点击缩略图直接进入 App 内全屏查看器。
- 查看器支持双指捏合放大/缩小、双击放大/还原、放大后拖动查看细节。
- 未放大时支持上下滑动切换上一张/下一张，同时保留按钮切换。
- 查看器内可直接删除照片、添加/修改备注。
- 修改备注时优先走 metadata-only 同步，不重新上传原图，提升大量图片下的操作速度。
- 照片列表超过 180 张时分批显示，避免一次性渲染太多 DOM 造成手机卡顿；查看器仍可在当前分类全部照片之间切换。
- Cloudflare Worker 新增 `POST /metadata`，用于备注等元数据快速同步。


## v10

- 删除照片查看器图片区域中间的上下浮动切换按钮。
- 保留底部“上一张 / 下一张”按钮和上下滑动切换逻辑。
- 更新 Service Worker 缓存版本，避免旧界面缓存。


## v11

- 照片查看器打开时禁用 iOS/Safari 整个页面的双指缩放。
- 双指手势只作用在图片本身，仍支持图片放大、缩小和拖动。
- 更新 viewport 与 Service Worker 缓存版本，减少旧代码残留。
