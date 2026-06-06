const DB_NAME = 'scene-camera-db';
const DB_VERSION = 1;
const ROOT_ID = 'root';
const MAX_THUMBNAIL = 480;

const $ = (id) => document.getElementById(id);
const els = {
  storageLine: $('storageLine'),
  settingsBtn: $('settingsBtn'),
  newFolderBtn: $('newFolderBtn'),
  captureBtn: $('captureBtn'),
  syncBtn: $('syncBtn'),
  exportBtn: $('exportBtn'),
  importInput: $('importInput'),
  cameraInput: $('cameraInput'),
  breadcrumbs: $('breadcrumbs'),
  folderList: $('folderList'),
  photoGrid: $('photoGrid'),
  noticeBox: $('noticeBox'),
  statPhotos: $('statPhotos'),
  statPending: $('statPending'),
  statFailed: $('statFailed'),
  statTrash: $('statTrash'),
  currentFolderTitle: $('currentFolderTitle'),
  currentFolderMeta: $('currentFolderMeta'),
  folderCount: $('folderCount'),
  photoCount: $('photoCount'),
  settingsDialog: $('settingsDialog'),
  apiBaseInput: $('apiBaseInput'),
  appPasswordInput: $('appPasswordInput'),
  saveSettingsBtn: $('saveSettingsBtn'),
  testConnectionBtn: $('testConnectionBtn'),
  settingsStatus: $('settingsStatus'),
  photoDialog: $('photoDialog'),
  photoPreview: $('photoPreview'),
  photoNote: $('photoNote'),
  photoMeta: $('photoMeta'),
  photoCounter: $('photoCounter'),
  prevPhotoBtn: $('prevPhotoBtn'),
  nextPhotoBtn: $('nextPhotoBtn'),
  prevPhotoTextBtn: $('prevPhotoTextBtn'),
  nextPhotoTextBtn: $('nextPhotoTextBtn'),
  saveNoteBtn: $('saveNoteBtn'),
  deletePhotoBtn: $('deletePhotoBtn')
};

let db;
let currentFolderId = ROOT_ID;
let selectedPhotoId = null;
let selectedPhotoIndex = -1;
let photoViewerIds = [];
let syncRunning = false;
let lastObjectUrls = [];
let currentPreviewUrl = '';

function fetchWithTimeout(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .catch((err) => {
      if (err?.name === 'AbortError') throw new Error('连接超时，请检查网络或 Worker 地址');
      throw err;
    })
    .finally(() => clearTimeout(timer));
}

function friendlyFetchError(err, context = '请求') {
  const msg = err?.message || String(err);
  if (msg === 'Failed to fetch' || msg === 'Load failed' || msg.includes('NetworkError')) {
    return `${context}失败：无法连接 Worker。请检查 Worker 地址、CORS_ORIGIN、Cloudflare 部署，或稍后重试。`;
  }
  return `${context}失败：${msg}`;
}

function req(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const d = request.result;
      if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('folders')) {
        const s = d.createObjectStore('folders', { keyPath: 'id' });
        s.createIndex('parentId', 'parentId', { unique: false });
      }
      if (!d.objectStoreNames.contains('photos')) {
        const s = d.createObjectStore('photos', { keyPath: 'id' });
        s.createIndex('folderId', 'folderId', { unique: false });
        s.createIndex('syncStatus', 'syncStatus', { unique: false });
        s.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

async function dbGet(storeName, key) {
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).get(key));
}

async function dbPut(storeName, value) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await txDone(tx);
  return value;
}

async function dbDelete(storeName, key) {
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

async function dbAll(storeName) {
  const tx = db.transaction(storeName, 'readonly');
  return req(tx.objectStore(storeName).getAll());
}

async function getSetting(key, fallback = '') {
  const row = await dbGet('settings', key);
  return row ? row.value : fallback;
}

async function setSetting(key, value) {
  await dbPut('settings', { key, value, updatedAt: new Date().toISOString() });
}

function uid(prefix = 'id') {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const random = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

function extFromMime(mime) {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/heic') return 'heic';
  if (mime === 'image/heif') return 'heif';
  return 'jpg';
}

function safeSegment(input) {
  return String(input || '未命名')
    .trim()
    .replace(/[\\/:*?"<>|#%{}^~\[\]`;&]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || '未命名';
}

function stableHash(input) {
  let h = 2166136261;
  const text = String(input || '');
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function formatBytes(n = 0) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatTs(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

async function ensureRootFolder() {
  const root = await dbGet('folders', ROOT_ID);
  if (!root) {
    await dbPut('folders', {
      id: ROOT_ID,
      name: '全部分类',
      parentId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }
}

async function getFolderMap() {
  const folders = await dbAll('folders');
  return new Map(folders.map(f => [f.id, f]));
}

async function getFolderPath(folderId) {
  const map = await getFolderMap();
  const path = [];
  let cur = map.get(folderId);
  let guard = 0;
  while (cur && cur.id !== ROOT_ID && guard++ < 50) {
    path.unshift(cur);
    cur = map.get(cur.parentId);
  }
  return path;
}

async function getFolderPathNames(folderId) {
  const path = await getFolderPath(folderId);
  return path.map(f => f.name);
}

async function getChildren(parentId) {
  const folders = await dbAll('folders');
  return folders
    .filter(f => f.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

async function getActivePhotosInFolder(folderId) {
  const photos = await dbAll('photos');
  return photos
    .filter(p => p.folderId === folderId && !p.deletedAt)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function sha256Hex(blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return [...new Uint8Array(hashBuffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(r.error);
    r.onload = () => resolve(r.result);
    r.readAsDataURL(blob);
  });
}

async function makeThumbnail(blob) {
  const dataUrl = await blobToDataUrl(blob);
  const img = await new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const scale = Math.min(1, MAX_THUMBNAIL / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.72));
}

async function updateStorageLine() {
  let persistedText = '未知';
  try {
    if (navigator.storage?.persisted) {
      const already = await navigator.storage.persisted();
      const persisted = already || (navigator.storage.persist ? await navigator.storage.persist() : false);
      persistedText = persisted ? '已请求持久化保护' : '未获得持久化保护';
    }
  } catch {
    persistedText = '无法检测持久化保护';
  }

  let quotaText = '';
  try {
    if (navigator.storage?.estimate) {
      const { usage = 0, quota = 0 } = await navigator.storage.estimate();
      quotaText = ` · 已用 ${formatBytes(usage)} / 可用 ${formatBytes(quota)}`;
    }
  } catch {}
  els.storageLine.textContent = `${persistedText}${quotaText}`;
}

async function render() {
  const folders = await dbAll('folders');
  const allPhotos = await dbAll('photos');
  const activePhotos = allPhotos.filter(p => !p.deletedAt);
  const pending = allPhotos.filter(p => ['pending', 'deletePending'].includes(p.syncStatus));
  const failed = allPhotos.filter(p => p.syncStatus === 'failed');
  const trash = allPhotos.filter(p => !!p.deletedAt);
  const children = await getChildren(currentFolderId);
  const currentPhotos = activePhotos.filter(p => p.folderId === currentFolderId);
  const path = await getFolderPath(currentFolderId);
  const currentFolderName = currentFolderId === ROOT_ID ? '全部分类' : (path[path.length - 1]?.name || '当前分类');

  els.statPhotos.textContent = activePhotos.length;
  els.statPending.textContent = pending.length;
  els.statFailed.textContent = failed.length;
  els.statTrash.textContent = trash.length;
  if (els.currentFolderTitle) els.currentFolderTitle.textContent = currentFolderName;
  if (els.currentFolderMeta) els.currentFolderMeta.textContent = `${children.length} 个子分类 · ${currentPhotos.length} 张照片`;
  if (els.folderCount) els.folderCount.textContent = `${children.length} 个`;
  if (els.photoCount) els.photoCount.textContent = `${currentPhotos.length} 张`;

  const unsyncedActive = activePhotos.filter(p => p.syncStatus !== 'synced');
  if (unsyncedActive.length > 0 || failed.length > 0) {
    els.noticeBox.hidden = false;
    els.noticeBox.textContent = `还有 ${unsyncedActive.length} 张活动照片未同步到 GitHub。请不要清理 Safari 网站数据；同步前可先导出 ZIP 作为第二份备份。`;
  } else {
    els.noticeBox.hidden = true;
  }

  await renderBreadcrumbs(path);
  await renderFolders(children, allPhotos);
  await renderPhotos(currentPhotos);
}

async function renderBreadcrumbs(path = null) {
  path = path || await getFolderPath(currentFolderId);
  els.breadcrumbs.innerHTML = '';
  const rootBtn = document.createElement('button');
  rootBtn.textContent = '全部分类';
  rootBtn.onclick = () => { currentFolderId = ROOT_ID; render(); };
  els.breadcrumbs.append(rootBtn);
  for (const f of path) {
    const btn = document.createElement('button');
    btn.textContent = `› ${f.name}`;
    btn.onclick = () => { currentFolderId = f.id; render(); };
    els.breadcrumbs.append(btn);
  }
}

async function renderFolders(children = null, allPhotos = null) {
  children = children || await getChildren(currentFolderId);
  allPhotos = allPhotos || await dbAll('photos');
  els.folderList.innerHTML = '';
  if (children.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '还没有子分类。可以先新建分类，或直接在当前分类拍照。';
    els.folderList.append(empty);
    return;
  }
  for (const folder of children) {
    const item = document.createElement('div');
    item.className = 'folder-item';

    const main = document.createElement('div');
    main.className = 'folder-main';
    const icon = document.createElement('div');
    icon.className = 'folder-icon';
    icon.textContent = '📁';
    const copy = document.createElement('div');
    copy.style.minWidth = '0';
    const name = document.createElement('div');
    name.className = 'name';
    name.textContent = folder.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    const count = allPhotos.filter(p => p.folderId === folder.id && !p.deletedAt).length;
    sub.textContent = `${count} 张照片`;
    copy.append(name, sub);
    main.append(icon, copy);

    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '进入';
    openBtn.onclick = () => { currentFolderId = folder.id; render(); };
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.textContent = '改名';
    renameBtn.onclick = async () => renameFolder(folder.id);
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '删除';
    delBtn.className = 'danger';
    delBtn.onclick = async () => deleteFolder(folder.id);
    actions.append(openBtn, renameBtn, delBtn);
    item.append(main, actions);
    els.folderList.append(item);
  }
}

async function renderPhotos(photos = null) {
  photos = photos || await getActivePhotosInFolder(currentFolderId);
  photoViewerIds = photos.map(p => p.id);
  for (const url of lastObjectUrls) URL.revokeObjectURL(url);
  lastObjectUrls = [];
  els.photoGrid.innerHTML = '';
  if (photos.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.textContent = '这个分类还没有照片。点击上方“拍照”，照片会先保存到本机，再进入同步队列。';
    els.photoGrid.append(empty);
    return;
  }

  for (const photo of photos) {
    const btn = document.createElement('button');
    btn.className = 'photo-card';
    const blob = photo.thumbBlob || photo.blob;
    const url = URL.createObjectURL(blob);
    lastObjectUrls.push(url);
    const badgeClass = photo.syncStatus === 'synced' ? 'synced' : photo.syncStatus === 'failed' ? 'failed' : 'pending';
    const badgeText = photo.syncStatus === 'synced' ? '已同步'
      : photo.syncStatus === 'failed' ? '失败'
      : photo.syncStatus === 'cloudOnly' ? '云端'
      : photo.syncStatus === 'cloudMissing' ? '本地保留'
      : '待同步';
    const img = document.createElement('img');
    img.alt = '照片';
    img.src = url;
    const badge = document.createElement('span');
    badge.className = `badge ${badgeClass}`;
    badge.textContent = badgeText;
    btn.append(img, badge);
    btn.onclick = () => openPhoto(photo.id, photoViewerIds);
    els.photoGrid.append(btn);
  }
}

async function createFolder() {
  const name = prompt('分类名称');
  if (!name?.trim()) return;
  const now = new Date().toISOString();
  await dbPut('folders', { id: uid('folder'), name: name.trim(), parentId: currentFolderId, createdAt: now, updatedAt: now });
  await render();
  await syncFoldersSafe();
}

async function renameFolder(folderId) {
  if (folderId === ROOT_ID) return;
  const folder = await dbGet('folders', folderId);
  if (!folder) return;
  const name = prompt('新的分类名称', folder.name || '');
  if (!name?.trim()) return;
  const nextName = name.trim();
  if (nextName === folder.name) return;
  folder.name = nextName;
  folder.updatedAt = new Date().toISOString();
  await dbPut('folders', folder);
  await render();
  await syncFoldersSafe();
}

async function deleteFolder(folderId) {
  const children = await getChildren(folderId);
  const photos = await getActivePhotosInFolder(folderId);
  if (children.length || photos.length) {
    alert('为了避免误删数据，第一版只允许删除空分类。请先移动或删除里面的照片和子分类。');
    return;
  }
  if (!confirm('确认删除这个空分类？')) return;
  await dbDelete('folders', folderId);
  await render();
  await syncFoldersSafe();
}

async function handleCapture(file) {
  if (!file) return;
  const now = new Date();
  const createdAt = now.toISOString();
  const id = uid('photo');
  const ext = extFromMime(file.type);
  const filename = `${createdAt.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}_${id}.${ext}`;

  setBusy(true, '正在把照片先保存到本地…');
  try {
    const hash = await sha256Hex(file);
    let thumbBlob = null;
    try {
      thumbBlob = await makeThumbnail(file);
    } catch (thumbErr) {
      console.warn('thumbnail failed; original photo is still saved', thumbErr);
    }
    const photo = {
      id,
      folderId: currentFolderId,
      filename,
      blob: file,
      thumbBlob,
      mime: file.type || 'image/jpeg',
      size: file.size,
      sha256: hash,
      note: '',
      createdAt,
      updatedAt: createdAt,
      exportedAt: null,
      syncStatus: 'pending',
      retryCount: 0,
      lastError: '',
      remotePath: '',
      remoteMetaPath: '',
      remoteSyncedAt: null,
      deletedAt: null
    };
    await dbPut('photos', photo);
    await render();
    await syncNow(false);
  } catch (err) {
    alert(`保存照片失败：${err.message || err}`);
  } finally {
    setBusy(false);
    els.cameraInput.value = '';
  }
}

function setBusy(isBusy, label = '') {
  for (const el of [els.captureBtn, els.syncBtn, els.exportBtn]) el.disabled = isBusy;
  if (label) {
    els.noticeBox.hidden = false;
    els.noticeBox.textContent = label;
  }
}

async function openPhoto(photoId, ids = null) {
  if (Array.isArray(ids) && ids.length) photoViewerIds = ids.slice();
  if (!photoViewerIds.includes(photoId)) {
    const photos = await getActivePhotosInFolder(currentFolderId);
    photoViewerIds = photos.map(p => p.id);
  }
  selectedPhotoIndex = Math.max(0, photoViewerIds.indexOf(photoId));
  selectedPhotoId = photoId;
  await renderPhotoDialogContent();
  if (!els.photoDialog.open) els.photoDialog.showModal();
}

async function renderPhotoDialogContent() {
  if (!selectedPhotoId) return;
  const photo = await dbGet('photos', selectedPhotoId);
  if (!photo) return;
  if (currentPreviewUrl) URL.revokeObjectURL(currentPreviewUrl);
  currentPreviewUrl = URL.createObjectURL(photo.blob);
  els.photoPreview.src = currentPreviewUrl;
  els.photoNote.value = photo.note || '';
  const total = photoViewerIds.length || 1;
  const humanIndex = selectedPhotoIndex >= 0 ? selectedPhotoIndex + 1 : 1;
  if (els.photoCounter) els.photoCounter.textContent = `${humanIndex} / ${total}`;
  for (const btn of [els.prevPhotoBtn, els.prevPhotoTextBtn]) if (btn) btn.disabled = total <= 1;
  for (const btn of [els.nextPhotoBtn, els.nextPhotoTextBtn]) if (btn) btn.disabled = total <= 1;
  els.photoMeta.textContent = `状态：${photo.syncStatus} · 大小：${formatBytes(photo.size)} · 创建：${formatTs(photo.createdAt)}${photo.remoteSyncedAt ? ` · 已同步：${formatTs(photo.remoteSyncedAt)}` : ''}${photo.lastError ? ` · 错误：${photo.lastError}` : ''}`;
}

async function switchPhoto(delta) {
  if (!photoViewerIds.length) return;
  const currentIndex = Math.max(0, photoViewerIds.indexOf(selectedPhotoId));
  selectedPhotoIndex = (currentIndex + delta + photoViewerIds.length) % photoViewerIds.length;
  selectedPhotoId = photoViewerIds[selectedPhotoIndex];
  await renderPhotoDialogContent();
}

async function saveSelectedNote() {
  if (!selectedPhotoId) return;
  const photo = await dbGet('photos', selectedPhotoId);
  if (!photo) return;
  photo.note = els.photoNote.value.trim();
  photo.updatedAt = new Date().toISOString();
  if (photo.syncStatus === 'synced') photo.syncStatus = 'pending';
  await dbPut('photos', photo);
  try { els.photoDialog.close(); } catch {}
  await render();
  await syncNow(false);
}

async function softDeleteSelectedPhoto() {
  if (!selectedPhotoId) return;
  const photo = await dbGet('photos', selectedPhotoId);
  if (!photo) return;
  const warning = photo.syncStatus === 'synced'
    ? '这会在本地隐藏照片，并请求 Worker 删除 GitHub 里的对应文件。本地副本会先保留在回收站。继续？'
    : '这张照片尚未同步到 GitHub。本地会先放入回收站，不会立即物理删除。继续？';
  if (!confirm(warning)) return;
  photo.deletedAt = new Date().toISOString();
  photo.updatedAt = photo.deletedAt;
  photo.syncStatus = photo.remotePath ? 'deletePending' : 'deletedLocal';
  await dbPut('photos', photo);
  els.photoDialog.close();
  await render();
  await syncNow(false);
}

async function getSyncConfig() {
  const apiBase = String(await getSetting('apiBase', '')).replace(/\/+$/, '');
  const appPassword = await getSetting('appPassword', '');
  return { apiBase, appPassword };
}

async function showSettings() {
  const { apiBase, appPassword } = await getSyncConfig();
  els.apiBaseInput.value = apiBase;
  els.appPasswordInput.value = appPassword;
  els.settingsDialog.showModal();
}

async function saveSettings() {
  await setSetting('apiBase', els.apiBaseInput.value.trim().replace(/\/+$/, ''));
  await setSetting('appPassword', els.appPasswordInput.value);
  if (els.settingsStatus) {
    els.settingsStatus.hidden = false;
    els.settingsStatus.textContent = '设置已保存。下次打开会默认先从云端加载。';
  }
  await render();
  try { els.settingsDialog.close(); } catch {}
}

async function testConnection() {
  const apiBase = els.apiBaseInput.value.trim().replace(/\/+$/, '');
  const appPassword = els.appPasswordInput.value;
  if (!apiBase || !appPassword) {
    if (els.settingsStatus) {
      els.settingsStatus.hidden = false;
      els.settingsStatus.textContent = '请先填写 Cloudflare Worker 地址和 App 密码。';
    }
    return;
  }
  if (els.settingsStatus) {
    els.settingsStatus.hidden = false;
    els.settingsStatus.textContent = '正在测试 Worker、密码、GitHub 读取和云端索引…';
  }
  try {
    const state = await fetchCloudState(apiBase, appPassword);
    await setSetting('apiBase', apiBase);
    await setSetting('appPassword', appPassword);
    if (els.settingsStatus) {
      els.settingsStatus.textContent = `连接成功：云端 ${state.folders?.length || 0} 个分类，${state.photos?.length || 0} 张照片，设置已自动保存。`;
    }
  } catch (err) {
    if (els.settingsStatus) els.settingsStatus.textContent = friendlyFetchError(err, '连接测试');
  }
}

async function syncFoldersSafe() {
  try { await syncFolders(); } catch (err) { console.warn('sync folders failed', err); }
}

function isLocalChangePending(photo) {
  return ['pending', 'deletePending'].includes(photo.syncStatus);
}

async function fetchCloudState(apiBase, appPassword) {
  const res = await fetchWithTimeout(`${apiBase}/cloud-state`, {
    method: 'GET',
    headers: { 'x-app-password': appPassword }
  }, 30000);
  const body = await safeJson(res);
  if (!res.ok) throw new Error(body?.error || body?.message || res.statusText || 'Cloud state failed');
  return body;
}

async function downloadCloudFile(apiBase, appPassword, remotePath) {
  const res = await fetchWithTimeout(`${apiBase}/file?path=${encodeURIComponent(remotePath)}`, {
    method: 'GET',
    headers: { 'x-app-password': appPassword }
  }, 60000);
  if (!res.ok) {
    const body = await safeJson(res);
    throw new Error(body?.error || body?.message || `下载云端照片失败：${res.status}`);
  }
  return res.blob();
}

async function mergeRemoteFolders(folders = []) {
  await ensureRootFolder();
  const localFolders = await dbAll('folders');
  const localMap = new Map(localFolders.map(f => [f.id, f]));
  const now = new Date().toISOString();
  let changed = 0;
  for (const folder of folders) {
    if (!folder?.id) continue;
    const normalized = {
      id: folder.id,
      name: folder.name || (folder.id === ROOT_ID ? '全部分类' : '未命名'),
      parentId: folder.id === ROOT_ID ? null : (folder.parentId || ROOT_ID),
      createdAt: folder.createdAt || now,
      updatedAt: folder.updatedAt || folder.createdAt || now
    };
    const existing = localMap.get(normalized.id);
    if (!existing || String(normalized.updatedAt) >= String(existing.updatedAt || '')) {
      await dbPut('folders', { ...existing, ...normalized });
      localMap.set(normalized.id, { ...existing, ...normalized });
      changed++;
    }
  }
  return changed;
}

async function ensureFolderForRemotePhoto(meta) {
  if (!meta?.folderId || meta.folderId === ROOT_ID) return ROOT_ID;
  const existing = await dbGet('folders', meta.folderId);
  if (existing) return meta.folderId;

  const names = Array.isArray(meta.folderPath) ? meta.folderPath.filter(Boolean) : [];
  let parentId = ROOT_ID;
  const now = new Date().toISOString();
  for (let i = 0; i < names.length; i++) {
    const isLast = i === names.length - 1;
    const id = isLast ? meta.folderId : `cloud_folder_${stableHash(names.slice(0, i + 1).join('/'))}`;
    const current = await dbGet('folders', id);
    if (!current) {
      await dbPut('folders', {
        id,
        name: names[i],
        parentId,
        createdAt: meta.createdAt || now,
        updatedAt: meta.updatedAt || meta.createdAt || now
      });
    }
    parentId = id;
  }
  if (!names.length && !await dbGet('folders', meta.folderId)) {
    await dbPut('folders', {
      id: meta.folderId,
      name: '云端分类',
      parentId: ROOT_ID,
      createdAt: meta.createdAt || now,
      updatedAt: meta.updatedAt || meta.createdAt || now
    });
  }
  return meta.folderId;
}

async function mergeRemotePhotos(remotePhotos = [], deletions = [], apiBase, appPassword) {
  const deletionIds = new Set((deletions || []).map(d => d.id).filter(Boolean));
  const remotePaths = new Set(remotePhotos.map(p => p.remotePath).filter(Boolean));
  let downloaded = 0;
  let updated = 0;
  let deleted = 0;

  for (const meta of remotePhotos) {
    if (!meta?.id || !meta.remotePath) continue;
    if (deletionIds.has(meta.id)) continue;
    await ensureFolderForRemotePhoto(meta);
    const local = await dbGet('photos', meta.id);
    if (local && isLocalChangePending(local)) continue;

    let blob = local?.blob || null;
    let thumbBlob = local?.thumbBlob || null;
    const sameHash = local?.sha256 && meta.sha256 && String(local.sha256).toLowerCase() === String(meta.sha256).toLowerCase();
    if (!blob || !sameHash) {
      blob = await downloadCloudFile(apiBase, appPassword, meta.remotePath);
      downloaded++;
      try { thumbBlob = await makeThumbnail(blob); } catch { thumbBlob = null; }
    }

    const now = new Date().toISOString();
    await dbPut('photos', {
      ...(local || {}),
      id: meta.id,
      folderId: meta.folderId || local?.folderId || ROOT_ID,
      filename: meta.filename || local?.filename || meta.remotePath.split('/').pop(),
      blob,
      thumbBlob,
      mime: meta.mime || blob.type || local?.mime || 'image/jpeg',
      size: meta.size || blob.size || local?.size || 0,
      sha256: meta.sha256 || local?.sha256 || '',
      note: meta.note || '',
      createdAt: meta.createdAt || local?.createdAt || now,
      updatedAt: meta.updatedAt || meta.uploadedAt || local?.updatedAt || now,
      exportedAt: local?.exportedAt || null,
      syncStatus: 'synced',
      retryCount: 0,
      lastError: '',
      remotePath: meta.remotePath,
      remoteMetaPath: meta.remoteMetaPath || `${meta.remotePath}.json`,
      remoteSyncedAt: meta.uploadedAt || local?.remoteSyncedAt || now,
      deletedAt: null
    });
    updated++;
  }

  const locals = await dbAll('photos');
  for (const photo of locals) {
    if (photo.deletedAt || isLocalChangePending(photo)) continue;
    if (deletionIds.has(photo.id)) {
      photo.deletedAt = new Date().toISOString();
      photo.syncStatus = 'deletedSynced';
      photo.lastError = '云端已删除，本地保留在回收站。';
      await dbPut('photos', photo);
      deleted++;
      continue;
    }
    if (photo.remotePath && photo.syncStatus === 'synced' && !remotePaths.has(photo.remotePath)) {
      // 不自动删除。云端缺失可能是仓库刚迁移、metadata 缺失或网络索引不完整。
      // 为了保证数据不丢，本地副本继续显示，只提醒用户可再次同步补回云端。
      photo.syncStatus = 'cloudMissing';
      photo.lastError = '云端索引未找到这张照片，本地副本已保留；再次同步会尝试补回云端。';
      await dbPut('photos', photo);
    }
  }
  return { downloaded, updated, deleted };
}

async function refreshFromCloud(showNotice = true) {
  const { apiBase, appPassword } = await getSyncConfig();
  if (!apiBase || !appPassword) return { skipped: true };
  if (showNotice) setBusy(true, '正在从 GitHub 云端加载分类和照片，本地未同步照片会保留…');
  try {
    const state = await fetchCloudState(apiBase, appPassword);
    const folderChanged = await mergeRemoteFolders(state.folders || []);
    const photoResult = await mergeRemotePhotos(state.photos || [], state.deletions || [], apiBase, appPassword);
    await setSetting('lastCloudRefreshAt', new Date().toISOString());
    if (showNotice) {
      els.noticeBox.hidden = false;
      els.noticeBox.textContent = `云端加载完成：${state.folders?.length || 0} 个分类，${state.photos?.length || 0} 张云端照片，新增下载 ${photoResult.downloaded} 张。`;
    }
    if (currentFolderId !== ROOT_ID && !await dbGet('folders', currentFolderId)) currentFolderId = ROOT_ID;
    await render();
    return { state, folderChanged, ...photoResult };
  } catch (err) {
    console.warn('refresh cloud failed', err);
    if (showNotice) {
      els.noticeBox.hidden = false;
      els.noticeBox.textContent = `云端加载失败：${err.message || err}。本地照片已保留，不会丢失。`;
    }
    throw err;
  } finally {
    if (showNotice) setBusy(false);
  }
}

async function syncFolders() {
  const { apiBase, appPassword } = await getSyncConfig();
  if (!apiBase || !appPassword) return false;

  // 先合并云端 folders.json，避免当前设备用旧分类覆盖其他设备的新分类。
  try {
    const remote = await fetchWithTimeout(`${apiBase}/folders`, { headers: { 'x-app-password': appPassword } }, 30000);
    if (remote.ok) {
      const body = await safeJson(remote);
      await mergeRemoteFolders(body?.folders || []);
    }
  } catch (err) {
    console.warn('load remote folders before push failed', err);
  }

  const folders = await dbAll('folders');
  const res = await fetchWithTimeout(`${apiBase}/folders`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-app-password': appPassword },
    body: JSON.stringify({ folders, updatedAt: new Date().toISOString() })
  }, 30000);
  const body = await safeJson(res);
  if (!res.ok) throw new Error(body?.error || body?.message || res.statusText || '同步分类失败');
  return true;
}

async function syncNow(showAlert = true) {
  if (syncRunning) {
    if (showAlert) alert('云端同步正在进行中，请稍等几秒后再试。');
    return;
  }
  const { apiBase, appPassword } = await getSyncConfig();
  if (!apiBase || !appPassword) {
    if (showAlert) await showSettings();
    return;
  }
  syncRunning = true;
  setBusy(true, '正在同步：先从云端加载，再上传/删除本地队列，失败会保留在本地…');
  try {
    await refreshFromCloud(false);
    await syncFolders();
    const photos = (await dbAll('photos')).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const photo of photos) {
      if (['pending', 'failed', 'cloudMissing'].includes(photo.syncStatus)) {
        await uploadPhoto(photo, apiBase, appPassword);
      } else if (photo.syncStatus === 'deletePending') {
        await deleteRemotePhoto(photo, apiBase, appPassword);
      }
    }
    await refreshFromCloud(false);
    if (showAlert) alert('同步完成。失败的照片会继续保留在本地，可再次点击同步。');
  } catch (err) {
    console.error(err);
    if (showAlert) alert(friendlyFetchError(err, '同步中断'));
  } finally {
    syncRunning = false;
    setBusy(false);
    await updateStorageLine();
    await render();
  }
}

async function autoCloudSyncOnStartup() {
  const { apiBase, appPassword } = await getSyncConfig();
  if (!apiBase || !appPassword || syncRunning) return;
  syncRunning = true;
  try {
    els.noticeBox.hidden = false;
    els.noticeBox.textContent = '正在后台加载云端数据，按钮仍可使用；失败不会删除本地照片…';
    await refreshFromCloud(false);
    await syncFoldersSafe();
    const photos = (await dbAll('photos')).sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
    for (const photo of photos) {
      if (['pending', 'failed', 'cloudMissing'].includes(photo.syncStatus)) {
        await uploadPhoto(photo, apiBase, appPassword);
      } else if (photo.syncStatus === 'deletePending') {
        await deleteRemotePhoto(photo, apiBase, appPassword);
      }
    }
    await refreshFromCloud(false);
    els.noticeBox.hidden = true;
  } catch (err) {
    console.warn('startup background sync failed', err);
    els.noticeBox.hidden = false;
    els.noticeBox.textContent = friendlyFetchError(err, '后台云端加载');
  } finally {
    syncRunning = false;
    await updateStorageLine();
    await render();
  }
}

async function buildPhotoMetadata(photo) {
  const folderPath = await getFolderPathNames(photo.folderId);
  const created = new Date(photo.createdAt);
  const yyyy = created.getFullYear();
  const mm = String(created.getMonth() + 1).padStart(2, '0');
  const safePath = folderPath.map(safeSegment).join('/');
  const remoteDir = safePath ? `photos/${yyyy}/${mm}/${safePath}` : `photos/${yyyy}/${mm}/未分类`;
  const remotePath = photo.remotePath || `${remoteDir}/${safeSegment(photo.filename)}`;
  const remoteMetaPath = photo.remoteMetaPath || `${remotePath}.json`;
  return {
    id: photo.id,
    folderId: photo.folderId,
    folderPath,
    filename: photo.filename,
    mime: photo.mime,
    size: photo.size,
    sha256: photo.sha256,
    note: photo.note || '',
    createdAt: photo.createdAt,
    updatedAt: photo.updatedAt,
    remotePath,
    remoteMetaPath,
    app: 'camera-archive-app',
    version: 1
  };
}

async function uploadPhoto(photo, apiBase, appPassword) {
  const metadata = await buildPhotoMetadata(photo);
  const fd = new FormData();
  fd.append('file', photo.blob, photo.filename);
  fd.append('metadata', JSON.stringify(metadata));
  try {
    const res = await fetchWithTimeout(`${apiBase}/upload`, {
      method: 'POST',
      headers: { 'x-app-password': appPassword },
      body: fd
    }, 90000);
    const body = await safeJson(res);
    if (!res.ok) throw new Error(body?.error || body?.message || res.statusText);
    photo.syncStatus = 'synced';
    photo.remotePath = body.remotePath;
    photo.remoteMetaPath = body.remoteMetaPath;
    photo.remoteSyncedAt = new Date().toISOString();
    photo.lastError = '';
    photo.retryCount = 0;
    await dbPut('photos', photo);
  } catch (err) {
    photo.syncStatus = 'failed';
    photo.retryCount = (photo.retryCount || 0) + 1;
    photo.lastError = String(err.message || err).slice(0, 500);
    await dbPut('photos', photo);
  }
}

async function deleteRemotePhoto(photo, apiBase, appPassword) {
  if (!photo.remotePath) {
    photo.syncStatus = 'deletedLocal';
    await dbPut('photos', photo);
    return;
  }
  try {
    const res = await fetchWithTimeout(`${apiBase}/photo`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json', 'x-app-password': appPassword },
      body: JSON.stringify({ id: photo.id, remotePath: photo.remotePath, remoteMetaPath: photo.remoteMetaPath, deletedAt: new Date().toISOString() })
    });
    const body = await safeJson(res);
    if (!res.ok) throw new Error(body?.error || body?.message || res.statusText);
    photo.syncStatus = 'deletedSynced';
    photo.remoteDeletedAt = new Date().toISOString();
    await dbPut('photos', photo);
  } catch (err) {
    photo.syncStatus = 'deletePending';
    photo.lastError = String(err.message || err).slice(0, 500);
    await dbPut('photos', photo);
  }
}

async function safeJson(res) {
  const text = await res.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

async function exportZip() {
  if (!window.JSZip) {
    alert('JSZip 还没加载完成或 CDN 不可用。联网刷新一次后再试。');
    return;
  }
  setBusy(true, '正在生成 ZIP 备份，本地未同步照片也会一起导出…');
  try {
    const zip = new JSZip();
    const folders = await dbAll('folders');
    const photos = (await dbAll('photos')).filter(p => !p.deletedAt);
    const manifest = { exportedAt: new Date().toISOString(), app: 'camera-archive-app', version: 1, folders, photos: [] };

    zip.file('folders.json', JSON.stringify(folders, null, 2));
    for (const photo of photos) {
      const meta = await buildPhotoMetadata(photo);
      const folderPath = meta.folderPath.length ? meta.folderPath.map(safeSegment).join('/') : '未分类';
      const filePath = `${folderPath}/${safeSegment(photo.filename)}`;
      zip.file(filePath, photo.blob);
      manifest.photos.push({
        ...meta,
        remotePath: photo.remotePath || '',
        remoteMetaPath: photo.remoteMetaPath || '',
        remoteSyncedAt: photo.remoteSyncedAt || null,
        zipPath: filePath,
        exportedAt: new Date().toISOString()
      });
      photo.exportedAt = new Date().toISOString();
      await dbPut('photos', photo);
    }
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const zipFileName = `SceneCamera_Backup_${new Date().toISOString().slice(0,19).replace(/[-:T]/g,'')}.zip`;
    const file = new File([blob], zipFileName, { type: 'application/zip' });

    if (navigator.canShare?.({ files: [file] }) && navigator.share) {
      await navigator.share({ files: [file], title: '场景相机备份' });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = zipFileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
    await render();
  } catch (err) {
    alert(`导出失败：${err.message || err}`);
  } finally {
    setBusy(false);
  }
}

async function importZip(file) {
  if (!file) return;
  if (!window.JSZip) {
    alert('JSZip 还没加载完成或 CDN 不可用。联网刷新一次后再试。');
    return;
  }
  setBusy(true, '正在导入 ZIP，已有照片不会覆盖…');
  try {
    const zip = await JSZip.loadAsync(file);
    const foldersText = await zip.file('folders.json')?.async('string');
    const manifestText = await zip.file('manifest.json')?.async('string');
    if (!foldersText || !manifestText) throw new Error('ZIP 缺少 folders.json 或 manifest.json');
    const folders = JSON.parse(foldersText);
    const manifest = JSON.parse(manifestText);
    for (const folder of folders) {
      if (!await dbGet('folders', folder.id)) await dbPut('folders', folder);
    }
    let imported = 0;
    for (const item of manifest.photos || []) {
      if (await dbGet('photos', item.id)) continue;
      const entry = zip.file(item.zipPath);
      if (!entry) continue;
      const blob = await entry.async('blob');
      const thumbBlob = await makeThumbnail(blob);
      const hash = await sha256Hex(blob);
      await dbPut('photos', {
        id: item.id,
        folderId: item.folderId || ROOT_ID,
        filename: item.filename || item.zipPath.split('/').pop(),
        blob,
        thumbBlob,
        mime: item.mime || blob.type || 'image/jpeg',
        size: item.size || blob.size,
        sha256: item.sha256 || hash,
        note: item.note || '',
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || new Date().toISOString(),
        exportedAt: item.exportedAt || new Date().toISOString(),
        syncStatus: item.remotePath ? 'synced' : 'pending',
        retryCount: 0,
        lastError: '',
        remotePath: item.remotePath || '',
        remoteMetaPath: item.remoteMetaPath || '',
        remoteSyncedAt: item.remotePath ? new Date().toISOString() : null,
        deletedAt: null
      });
      imported++;
    }
    alert(`导入完成：${imported} 张新照片。`);
    await render();
  } catch (err) {
    alert(`导入失败：${err.message || err}`);
  } finally {
    els.importInput.value = '';
    setBusy(false);
  }
}

async function init() {
  db = await openDb();
  await ensureRootFolder();
  await updateStorageLine();
  await render();

  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch (err) { console.warn('sw register failed', err); }
  }

  els.newFolderBtn.onclick = createFolder;
  els.captureBtn.onclick = () => els.cameraInput.click();
  els.cameraInput.onchange = () => handleCapture(els.cameraInput.files?.[0]);
  els.syncBtn.onclick = () => syncNow(true);
  els.exportBtn.onclick = exportZip;
  els.importInput.onchange = () => importZip(els.importInput.files?.[0]);
  els.settingsBtn.onclick = showSettings;
  els.saveSettingsBtn.onclick = saveSettings;
  if (els.testConnectionBtn) els.testConnectionBtn.onclick = testConnection;
  if (els.prevPhotoBtn) els.prevPhotoBtn.onclick = () => switchPhoto(-1);
  if (els.nextPhotoBtn) els.nextPhotoBtn.onclick = () => switchPhoto(1);
  if (els.prevPhotoTextBtn) els.prevPhotoTextBtn.onclick = () => switchPhoto(-1);
  if (els.nextPhotoTextBtn) els.nextPhotoTextBtn.onclick = () => switchPhoto(1);
  els.saveNoteBtn.onclick = saveSelectedNote;
  els.deletePhotoBtn.onclick = softDeleteSelectedPhoto;

  els.photoDialog.addEventListener('close', () => {
    if (currentPreviewUrl) { URL.revokeObjectURL(currentPreviewUrl); currentPreviewUrl = ''; }
    selectedPhotoId = null;
    selectedPhotoIndex = -1;
  });

  window.addEventListener('online', () => syncNow(false));

  const { apiBase, appPassword } = await getSyncConfig();
  if (apiBase && appPassword) {
    // 每次打开默认以云端为准后台加载，同时保留本地未同步照片，避免数据丢失；不再锁住按钮。
    autoCloudSyncOnStartup().catch(err => console.warn('startup cloud sync failed', err));
  }
}

init().catch(err => {
  console.error(err);
  alert(`启动失败：${err.message || err}`);
});
