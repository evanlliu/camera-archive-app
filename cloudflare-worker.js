const GH_API = 'https://api.github.com';
const GH_VERSION = '2022-11-28';

export default {
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') return corsResponse(env, null, 204, request);
      const url = new URL(request.url);

      if (url.pathname === '/' && request.method === 'GET') {
        return corsResponse(env, { ok: true, service: 'scene-camera-worker' }, 200, request);
      }

      const authError = authorize(request, env);
      if (authError) return corsResponse(env, { error: authError }, 401, request);

      if (url.pathname === '/health' && request.method === 'GET') return handleHealth(request, env);
      if (url.pathname === '/cloud-state' && request.method === 'GET') return handleCloudState(request, env);
      if (url.pathname === '/file' && request.method === 'GET') return handleGetFile(request, env);
      if (url.pathname === '/upload' && request.method === 'POST') return handleUpload(request, env);
      if (url.pathname === '/metadata' && request.method === 'POST') return handleMetadataOnly(request, env);
      if (url.pathname === '/photo' && request.method === 'DELETE') return handleDeletePhoto(request, env);
      if (url.pathname === '/cleanup-moved-photo' && request.method === 'POST') return handleCleanupMovedPhoto(request, env);
      if (url.pathname === '/folders' && (request.method === 'PUT' || request.method === 'POST')) return handlePutFolders(request, env);
      if (url.pathname === '/folders' && request.method === 'GET') return handleGetFolders(request, env);
      if (url.pathname === '/remote-index' && request.method === 'GET') return handleRemoteIndex(request, env);

      return corsResponse(env, { error: 'Not found' }, 404, request);
    } catch (err) {
      return corsResponse(env, { error: err.message || String(err) }, 500, request);
    }
  }
};

function authorize(request, env) {
  const expected = env.APP_PASSWORD;
  if (!expected) return 'Worker missing APP_PASSWORD secret';
  const got = request.headers.get('x-app-password') || '';
  if (got !== expected) return 'Invalid app password';
  return '';
}

async function handleHealth(request, env) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `${GH_API}/repos/${owner}/${repo}?ref=${encodeURIComponent(branch)}`;
  const res = await ghFetch(env, url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) return corsResponse(env, { ok: false, error: json.message || `GitHub ${res.status}` }, res.status, request);
  return corsResponse(env, { ok: true, repo: `${owner}/${repo}`, branch }, 200, request);
}

async function handleCloudState(request, env) {
  const [foldersPayload, tree] = await Promise.all([
    getFoldersPayload(env),
    listGitTree(env)
  ]);

  const photoMetaFiles = tree
    .filter(x => x.type === 'blob' && x.path.startsWith('photos/') && x.path.endsWith('.json'))
    .sort((a, b) => a.path.localeCompare(b.path));
  const deletionFiles = tree
    .filter(x => x.type === 'blob' && x.path.startsWith('deletions/') && x.path.endsWith('.json'))
    .sort((a, b) => a.path.localeCompare(b.path));

  const photoById = new Map();
  const skipped = [];
  for (const item of photoMetaFiles) {
    try {
      const text = await getGitBlobText(env, item.sha);
      const meta = JSON.parse(text);
      if (meta?.id && meta?.remotePath) {
        meta.remoteMetaPath = meta.remoteMetaPath || item.path;
        const current = photoById.get(meta.id);
        if (!current || isRemoteMetaNewer(meta, current)) photoById.set(meta.id, meta);
      } else {
        skipped.push({ path: item.path, reason: 'metadata missing id or remotePath' });
      }
    } catch (err) {
      skipped.push({ path: item.path, reason: err.message || String(err) });
    }
  }
  const photos = [...photoById.values()].sort((a, b) => String(a.remotePath).localeCompare(String(b.remotePath)));

  const deletions = [];
  for (const item of deletionFiles) {
    try {
      const text = await getGitBlobText(env, item.sha);
      const deletion = JSON.parse(text);
      if (deletion?.id || deletion?.remotePath) deletions.push(deletion);
    } catch (err) {
      skipped.push({ path: item.path, reason: err.message || String(err) });
    }
  }

  return corsResponse(env, {
    ok: true,
    refreshedAt: new Date().toISOString(),
    folders: foldersPayload.folders || [],
    foldersUpdatedAt: foldersPayload.updatedAt || null,
    photos,
    deletions,
    skipped,
    count: {
      folders: (foldersPayload.folders || []).length,
      photos: photos.length,
      deletions: deletions.length,
      skipped: skipped.length
    }
  }, 200, request);
}

async function handleGetFile(request, env) {
  const url = new URL(request.url);
  const path = normalizeRepoPath(url.searchParams.get('path') || '');
  if (!path) return corsResponse(env, { error: 'path required' }, 400, request);
  const info = await getGitHubContent(env, path);
  if (!info?.sha) return corsResponse(env, { error: 'File not found' }, 404, request);
  const blob = await getGitBlob(env, info.sha);
  return binaryCorsResponse(env, blob.buffer, 200, request, guessContentType(path));
}

async function handleUpload(request, env) {
  const maxMb = Number(env.MAX_UPLOAD_MB || 50);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxMb * 1024 * 1024) {
    return corsResponse(env, { error: `File too large. MAX_UPLOAD_MB=${maxMb}` }, 413, request);
  }

  const form = await request.formData();
  const file = form.get('file');
  const thumb = form.get('thumb');
  const metadataRaw = form.get('metadata');
  if (!file || typeof file === 'string') return corsResponse(env, { error: 'Missing file field' }, 400, request);
  if (!metadataRaw || typeof metadataRaw !== 'string') return corsResponse(env, { error: 'Missing metadata field' }, 400, request);

  const metadata = JSON.parse(metadataRaw);
  validateMetadata(metadata);

  if (file.size > maxMb * 1024 * 1024) {
    return corsResponse(env, { error: `File too large. MAX_UPLOAD_MB=${maxMb}` }, 413, request);
  }

  const remotePath = normalizeRepoPath(metadata.remotePath);
  const remoteMetaPath = normalizeRepoPath(metadata.remoteMetaPath || `${remotePath}.json`);
  let remoteThumbPath = '';
  const now = new Date().toISOString();

  const imageBuffer = await file.arrayBuffer();
  await putOrUpdateFile(env, remotePath, imageBuffer, `Upload photo ${metadata.id}`);

  if (thumb && typeof thumb !== 'string' && thumb.size > 0) {
    remoteThumbPath = normalizeRepoPath(metadata.remoteThumbPath || `${remotePath}.thumb.jpg`);
    const thumbBuffer = await thumb.arrayBuffer();
    await putOrUpdateFile(env, remoteThumbPath, thumbBuffer, `Upload thumbnail ${metadata.id}`);
  }

  const finalMetadata = {
    ...metadata,
    remotePath,
    remoteMetaPath,
    remoteThumbPath,
    uploadedAt: now,
    workerVersion: 3
  };

  await putOrUpdateFile(env, remoteMetaPath, JSON.stringify(finalMetadata, null, 2), `Upload metadata ${metadata.id}`);

  return corsResponse(env, { ok: true, remotePath, remoteMetaPath, remoteThumbPath, uploadedAt: now }, 200, request);
}
async function handleMetadataOnly(request, env) {
  const body = await request.json();
  const metadata = body.metadata || body;
  validateMetadata(metadata);
  const remotePath = normalizeRepoPath(metadata.remotePath);
  const remoteMetaPath = normalizeRepoPath(metadata.remoteMetaPath || `${remotePath}.json`);
  const now = new Date().toISOString();
  const finalMetadata = {
    ...metadata,
    remotePath,
    remoteMetaPath,
    remoteThumbPath: normalizeRepoPath(metadata.remoteThumbPath || `${remotePath}.thumb.jpg`),
    uploadedAt: metadata.uploadedAt || now,
    metadataUpdatedAt: now,
    workerVersion: 4
  };
  await putOrUpdateFile(env, remoteMetaPath, JSON.stringify(finalMetadata, null, 2), `Update metadata ${metadata.id}`);
  return corsResponse(env, { ok: true, remotePath, remoteMetaPath, metadataUpdatedAt: now }, 200, request);
}


async function handleDeletePhoto(request, env) {
  const body = await request.json();
  const remotePath = normalizeRepoPath(body.remotePath || '');
  const remoteMetaPath = normalizeRepoPath(body.remoteMetaPath || `${remotePath}.json`);
  const remoteThumbPath = normalizeRepoPath(body.remoteThumbPath || `${remotePath}.thumb.jpg`);
  if (!remotePath) return corsResponse(env, { error: 'remotePath required' }, 400, request);

  const deleted = [];
  const missing = [];
  for (const path of [remoteMetaPath, remoteThumbPath, remotePath]) {
    const result = await deleteFileIfExists(env, path, `Delete ${path}`);
    if (result === 'deleted') deleted.push(path);
    if (result === 'missing') missing.push(path);
  }

  const tombstone = {
    id: body.id || '',
    remotePath,
    remoteMetaPath,
    remoteThumbPath,
    deletedAt: body.deletedAt || new Date().toISOString(),
    deletedBy: 'camera-archive-app',
    workerVersion: 2
  };
  const tombstoneId = tombstone.id || safeIdFromPath(remotePath);
  await putOrUpdateFile(env, `deletions/${tombstoneId}.json`, JSON.stringify(tombstone, null, 2), `Record deletion ${tombstoneId}`);

  return corsResponse(env, { ok: true, deleted, missing, tombstone }, 200, request);
}

async function handleCleanupMovedPhoto(request, env) {
  const body = await request.json();
  const oldRemotePath = normalizeRepoPath(body.oldRemotePath || '');
  const oldRemoteMetaPath = normalizeRepoPath(body.oldRemoteMetaPath || `${oldRemotePath}.json`);
  const oldRemoteThumbPath = normalizeRepoPath(body.oldRemoteThumbPath || `${oldRemotePath}.thumb.jpg`);
  const newRemotePath = normalizeRepoPath(body.newRemotePath || '');
  const newRemoteMetaPath = normalizeRepoPath(body.newRemoteMetaPath || `${newRemotePath}.json`);
  const newRemoteThumbPath = normalizeRepoPath(body.newRemoteThumbPath || `${newRemotePath}.thumb.jpg`);
  if (!oldRemotePath) return corsResponse(env, { error: 'oldRemotePath required' }, 400, request);

  const deleted = [];
  const missing = [];
  const skipped = [];
  for (const path of [oldRemoteMetaPath, oldRemoteThumbPath, oldRemotePath]) {
    if (!path || path === newRemotePath || path === newRemoteMetaPath || path === newRemoteThumbPath) {
      skipped.push(path);
      continue;
    }
    const result = await deleteFileIfExists(env, path, `Cleanup moved photo ${body.id || oldRemotePath}`);
    if (result === 'deleted') deleted.push(path);
    if (result === 'missing') missing.push(path);
  }

  return corsResponse(env, { ok: true, deleted, missing, skipped }, 200, request);
}

async function handlePutFolders(request, env) {
  const body = await request.json();
  if (!Array.isArray(body.folders)) return corsResponse(env, { error: 'folders array required' }, 400, request);
  const payload = {
    app: 'scene-camera-pwa',
    version: 1,
    updatedAt: body.updatedAt || new Date().toISOString(),
    folders: body.folders
  };
  await putOrUpdateFile(env, 'folders.json', JSON.stringify(payload, null, 2), 'Update folders.json');
  return corsResponse(env, { ok: true, count: body.folders.length }, 200, request);
}

async function handleGetFolders(request, env) {
  const payload = await getFoldersPayload(env);
  return corsResponse(env, payload, 200, request);
}

async function handleRemoteIndex(request, env) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `${GH_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await ghFetch(env, url);
  const json = await res.json();
  if (!res.ok) return corsResponse(env, json, res.status, request);
  const files = (json.tree || [])
    .filter(x => x.type === 'blob' && (x.path.endsWith('.jpg') || x.path.endsWith('.jpeg') || x.path.endsWith('.png') || x.path.endsWith('.webp') || x.path.endsWith('.heic') || x.path.endsWith('.heif') || x.path.endsWith('.json')))
    .map(x => ({ path: x.path, size: x.size, sha: x.sha }));
  return corsResponse(env, { ok: true, files }, 200, request);
}

async function getFoldersPayload(env) {
  const file = await getGitHubContent(env, 'folders.json');
  if (!file) return { folders: [], updatedAt: null };
  const text = await getGitBlobText(env, file.sha);
  return JSON.parse(text);
}

async function listGitTree(env) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `${GH_API}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const res = await ghFetch(env, url);
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub tree failed: ${res.status} ${json.message || ''}`);
  return json.tree || [];
}

async function getGitBlob(env, sha) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const url = `${GH_API}/repos/${owner}/${repo}/git/blobs/${encodeURIComponent(sha)}`;
  const res = await ghFetch(env, url);
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub blob ${sha} failed: ${res.status} ${json.message || ''}`);
  if (json.encoding !== 'base64' || !json.content) throw new Error(`GitHub blob ${sha} has unsupported encoding`);
  return base64ToUint8Array(json.content);
}

async function getGitBlobText(env, sha) {
  const bytes = await getGitBlob(env, sha);
  return new TextDecoder().decode(bytes);
}

function isRemoteMetaNewer(next, current) {
  const nextTime = Date.parse(next.uploadedAt || next.updatedAt || next.createdAt || 0) || 0;
  const currentTime = Date.parse(current.uploadedAt || current.updatedAt || current.createdAt || 0) || 0;
  if (nextTime !== currentTime) return nextTime > currentTime;
  return String(next.remotePath || '').localeCompare(String(current.remotePath || '')) > 0;
}

function guessContentType(path) {
  const p = String(path).toLowerCase();
  if (p.endsWith('.png')) return 'image/png';
  if (p.endsWith('.gif')) return 'image/gif';
  if (p.endsWith('.webp')) return 'image/webp';
  if (p.endsWith('.heic')) return 'image/heic';
  if (p.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

function safeIdFromPath(path) {
  return normalizeRepoPath(path).replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 120) || 'unknown';
}

function validateMetadata(m) {
  for (const key of ['id', 'filename', 'sha256', 'createdAt', 'remotePath']) {
    if (!m[key]) throw new Error(`metadata.${key} required`);
  }
  if (!/^[a-f0-9]{64}$/i.test(m.sha256)) throw new Error('metadata.sha256 invalid');
}

async function putOrUpdateFile(env, path, data, message) {
  const existing = await getGitHubContent(env, path);
  const body = {
    message,
    content: typeof data === 'string' ? utf8ToBase64(data) : arrayBufferToBase64(data),
    branch: env.GITHUB_BRANCH || 'main'
  };
  if (existing?.sha) body.sha = existing.sha;

  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await ghFetch(env, url, { method: 'PUT', body: JSON.stringify(body) });
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub PUT ${path} failed: ${res.status} ${json.message || ''}`);
  return json;
}

async function deleteFileIfExists(env, path, message) {
  const existing = await getGitHubContent(env, path);
  if (!existing?.sha) return 'missing';

  const body = { message, sha: existing.sha, branch: env.GITHUB_BRANCH || 'main' };
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodePath(path)}`;
  const res = await ghFetch(env, url, { method: 'DELETE', body: JSON.stringify(body) });
  if (res.status === 404) return 'missing';
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GitHub DELETE ${path} failed: ${res.status} ${json.message || ''}`);
  return 'deleted';
}

async function getGitHubContent(env, path) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const url = `${GH_API}/repos/${owner}/${repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}`;
  const res = await ghFetch(env, url);
  if (res.status === 404) return null;
  const json = await res.json();
  if (!res.ok) throw new Error(`GitHub GET ${path} failed: ${res.status} ${json.message || ''}`);
  return json;
}

function ghFetch(env, url, init = {}) {
  const token = required(env.GITHUB_TOKEN, 'GITHUB_TOKEN');
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/vnd.github+json');
  headers.set('X-GitHub-Api-Version', GH_VERSION);
  headers.set('User-Agent', 'scene-camera-worker');
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  return fetch(url, { ...init, headers });
}

function corsResponse(env, data, status = 200, request) {
  const headers = corsHeaders(env, request);
  if (status === 204) return new Response(null, { status, headers });
  headers['content-type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(data), { status, headers });
}

function corsHeaders(env, request) {
  const origin = request?.headers.get('origin') || '';
  const allowed = env.CORS_ORIGIN || '*';
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  return {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-app-password',
    'access-control-max-age': '86400'
  };
}

function binaryCorsResponse(env, data, status = 200, request, contentType = 'application/octet-stream') {
  const headers = corsHeaders(env, request);
  headers['content-type'] = contentType;
  headers['cache-control'] = 'private, max-age=60';
  return new Response(data, { status, headers });
}

function required(value, name) {
  if (!value) throw new Error(`Worker missing ${name}`);
  return value;
}

function normalizeRepoPath(path) {
  return String(path || '')
    .replace(/^\/+/, '')
    .replace(/\.\./g, '_')
    .replace(/[\\]/g, '/')
    .split('/')
    .map(s => s.trim().replace(/[\x00-\x1F]/g, '_'))
    .filter(Boolean)
    .join('/');
}

function encodePath(path) {
  return normalizeRepoPath(path).split('/').map(encodeURIComponent).join('/');
}

function base64ToUint8Array(base64) {
  const clean = String(base64 || '').replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function utf8ToBase64(str) {
  let binary = '';
  const bytes = new TextEncoder().encode(str);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function utf8FromBase64(base64) {
  const clean = String(base64).replace(/\s/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
