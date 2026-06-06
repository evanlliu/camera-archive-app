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
      if (url.pathname === '/write-check' && request.method === 'POST') return handleWriteCheck(request, env);
      if (url.pathname === '/upload' && request.method === 'POST') return handleUpload(request, env);
      if (url.pathname === '/photo' && request.method === 'DELETE') return handleDeletePhoto(request, env);
      if (url.pathname === '/folders' && request.method === 'PUT') return handlePutFolders(request, env);
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
  required(env.GITHUB_TOKEN, 'GITHUB_TOKEN');

  const repoUrl = `${GH_API}/repos/${owner}/${repo}`;
  const repoRes = await ghFetch(env, repoUrl);
  const repoJson = await repoRes.json().catch(() => ({}));
  if (!repoRes.ok) {
    return corsResponse(env, {
      ok: false,
      worker: true,
      github: false,
      error: `GitHub repo check failed: ${repoRes.status} ${repoJson.message || ''}`.trim()
    }, repoRes.status, request);
  }

  return corsResponse(env, {
    ok: true,
    worker: true,
    github: true,
    repo: `${owner}/${repo}`,
    private: Boolean(repoJson.private),
    branch,
    maxUploadMb: Number(env.MAX_UPLOAD_MB || 50),
    workerVersion: '1.2-write-check'
  }, 200, request);
}

async function handleWriteCheck(request, env) {
  const owner = required(env.GITHUB_OWNER, 'GITHUB_OWNER');
  const repo = required(env.GITHUB_REPO, 'GITHUB_REPO');
  const branch = env.GITHUB_BRANCH || 'main';
  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const payload = {
    ok: true,
    app: 'scene-camera-pwa',
    check: 'github-write',
    repo: `${owner}/${repo}`,
    branch,
    checkedAt: body.checkedAt || now,
    workerTime: now,
    workerVersion: '1.2-write-check'
  };
  const remotePath = '.system/healthcheck.json';
  await putOrUpdateFile(env, remotePath, JSON.stringify(payload, null, 2), 'Worker write check');
  return corsResponse(env, { ok: true, repo: `${owner}/${repo}`, branch, remotePath, checkedAt: now }, 200, request);
}

async function handleUpload(request, env) {
  const maxMb = Number(env.MAX_UPLOAD_MB || 50);
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength && contentLength > maxMb * 1024 * 1024) {
    return corsResponse(env, { error: `File too large. MAX_UPLOAD_MB=${maxMb}` }, 413, request);
  }

  const form = await request.formData();
  const file = form.get('file');
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
  const now = new Date().toISOString();
  const finalMetadata = {
    ...metadata,
    remotePath,
    remoteMetaPath,
    uploadedAt: now,
    workerVersion: 1
  };

  const imageBuffer = await file.arrayBuffer();
  await putOrUpdateFile(env, remotePath, imageBuffer, `Upload photo ${metadata.id}`);
  await putOrUpdateFile(env, remoteMetaPath, JSON.stringify(finalMetadata, null, 2), `Upload metadata ${metadata.id}`);

  return corsResponse(env, { ok: true, remotePath, remoteMetaPath, uploadedAt: now }, 200, request);
}

async function handleDeletePhoto(request, env) {
  const body = await request.json();
  const remotePath = normalizeRepoPath(body.remotePath || '');
  const remoteMetaPath = normalizeRepoPath(body.remoteMetaPath || `${remotePath}.json`);
  if (!remotePath) return corsResponse(env, { error: 'remotePath required' }, 400, request);

  const deleted = [];
  const missing = [];
  for (const path of [remoteMetaPath, remotePath]) {
    const result = await deleteFileIfExists(env, path, `Delete ${path}`);
    if (result === 'deleted') deleted.push(path);
    if (result === 'missing') missing.push(path);
  }
  return corsResponse(env, { ok: true, deleted, missing }, 200, request);
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
  const file = await getGitHubContent(env, 'folders.json');
  if (!file) return corsResponse(env, { folders: [], updatedAt: null }, 200, request);
  const text = utf8FromBase64(file.content || '');
  return corsResponse(env, JSON.parse(text), 200, request);
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
    .filter(x => x.type === 'blob' && (x.path.endsWith('.jpg') || x.path.endsWith('.jpeg') || x.path.endsWith('.png') || x.path.endsWith('.heic') || x.path.endsWith('.json')))
    .map(x => ({ path: x.path, size: x.size, sha: x.sha }));
  return corsResponse(env, { ok: true, files }, 200, request);
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
  const origin = request?.headers.get('origin') || '';
  const allowed = env.CORS_ORIGIN || '*';
  const allowOrigin = allowed === '*' ? '*' : (origin === allowed ? origin : allowed);
  const headers = {
    'access-control-allow-origin': allowOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-app-password',
    'access-control-max-age': '86400'
  };
  if (status === 204) return new Response(null, { status, headers });
  headers['content-type'] = 'application/json; charset=utf-8';
  return new Response(JSON.stringify(data), { status, headers });
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
