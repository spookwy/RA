/**
 * Upload app-bundle.tar.gz to GitHub Releases.
 *
 * Usage:
 *   set GITHUB_TOKEN=ghp_xxxxx
 *   node scripts/upload-bundle.js [--tag v1.4.0]
 *
 * Requirements:
 *   - GITHUB_TOKEN environment variable (with repo scope)
 *   - build/app-bundle.tar.gz must exist (run create-app-bundle.js first)
 *
 * The script will:
 *   1. Look up or create the GitHub Release for the given tag
 *   2. Upload app-bundle.tar.gz as a release asset
 *   3. Also upload app-bundle.tar.gz.meta (JSON metadata)
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const REPO = 'spookwy/RA';
const BUILD_DIR = path.join(__dirname, '..', 'build');

// Parse CLI args
let tagOverride = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--tag' && process.argv[i + 1]) {
    tagOverride = process.argv[++i];
  }
}

// Read version from package.json
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'));
const tag = tagOverride || `v${pkg.version}`;

const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) {
  console.error('[upload] ERROR: Set GITHUB_TOKEN environment variable');
  console.error('  Example: set GITHUB_TOKEN=ghp_xxxxxxxxxxxx');
  process.exit(1);
}

const gzPath = path.join(BUILD_DIR, 'app-bundle.tar.gz');
const metaPath = path.join(BUILD_DIR, 'app-bundle.tar.gz.meta');

if (!fs.existsSync(gzPath)) {
  console.error('[upload] ERROR: build/app-bundle.tar.gz not found. Run create-app-bundle.js first.');
  process.exit(1);
}

// GitHub API helper
function ghApi(method, apiPath, body = null, contentType = 'application/json') {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.github.com',
      path: apiPath,
      method,
      headers: {
        'User-Agent': 'VisualIllusion-Uploader',
        Authorization: `token ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
      },
    };
    if (body && contentType === 'application/json') {
      const data = JSON.stringify(body);
      options.headers['Content-Type'] = 'application/json';
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (body && contentType === 'application/json') req.write(JSON.stringify(body));
    req.end();
  });
}

// Upload binary asset to a release
function uploadAsset(uploadUrl, filePath, fileName, contentType = 'application/octet-stream') {
  return new Promise((resolve, reject) => {
    const fileSize = fs.statSync(filePath).size;
    const url = new URL(uploadUrl.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`));

    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'User-Agent': 'VisualIllusion-Uploader',
        Authorization: `token ${TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': contentType,
        'Content-Length': fileSize,
      },
    };

    console.log(`[upload] Uploading ${fileName} (${(fileSize / 1048576).toFixed(1)} MB)...`);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(JSON.parse(data)); } catch { resolve(data); }
        } else {
          reject(new Error(`Upload failed: HTTP ${res.statusCode} — ${data}`));
        }
      });
    });

    req.on('error', reject);

    // Stream the file with progress
    const stream = fs.createReadStream(filePath);
    let uploaded = 0;
    let lastPrint = 0;

    stream.on('data', (chunk) => {
      uploaded += chunk.length;
      const pct = Math.round((uploaded / fileSize) * 100);
      if (pct >= lastPrint + 5) {
        process.stdout.write(`\r[upload] ${fileName}: ${pct}% (${(uploaded / 1048576).toFixed(0)} / ${(fileSize / 1048576).toFixed(0)} MB)`);
        lastPrint = pct;
      }
    });

    stream.on('end', () => {
      console.log(`\r[upload] ${fileName}: 100% — done`);
    });

    stream.pipe(req);
  });
}

async function main() {
  console.log(`[upload] Repository: ${REPO}`);
  console.log(`[upload] Tag: ${tag}`);
  console.log(`[upload] Bundle: ${gzPath} (${(fs.statSync(gzPath).size / 1048576).toFixed(1)} MB)`);

  // Step 1: Find or create release
  console.log(`\n[upload] Looking for release ${tag}...`);
  let release;
  const getRes = await ghApi('GET', `/repos/${REPO}/releases/tags/${tag}`);

  if (getRes.status === 200) {
    release = getRes.data;
    console.log(`[upload] Found existing release: ${release.name || release.tag_name} (id: ${release.id})`);

    // Delete existing assets with the same name
    for (const asset of release.assets || []) {
      if (asset.name === 'app-bundle.tar.gz' || asset.name === 'app-bundle.tar.gz.meta') {
        console.log(`[upload] Deleting existing asset: ${asset.name}`);
        await ghApi('DELETE', `/repos/${REPO}/releases/assets/${asset.id}`);
      }
    }
  } else {
    console.log(`[upload] Release not found, creating ${tag}...`);
    const createRes = await ghApi('POST', `/repos/${REPO}/releases`, {
      tag_name: tag,
      name: `VisualIllusion ${tag}`,
      body: `VisualIllusion ${tag} release`,
      draft: false,
      prerelease: false,
    });

    if (createRes.status !== 201) {
      console.error(`[upload] Failed to create release:`, createRes.data);
      process.exit(1);
    }
    release = createRes.data;
    console.log(`[upload] Created release: ${release.name} (id: ${release.id})`);
  }

  // Step 2: Upload app-bundle.tar.gz
  console.log(`\n[upload] Uploading bundle...`);
  await uploadAsset(release.upload_url, gzPath, 'app-bundle.tar.gz', 'application/gzip');

  // Step 3: Upload metadata
  if (fs.existsSync(metaPath)) {
    console.log(`[upload] Uploading metadata...`);
    await uploadAsset(release.upload_url, metaPath, 'app-bundle.tar.gz.meta', 'application/json');
  }

  // Final summary
  const downloadUrl = `https://github.com/${REPO}/releases/download/${tag}/app-bundle.tar.gz`;
  console.log(`\n[upload] ✅ Upload complete!`);
  console.log(`[upload] Download URL: ${downloadUrl}`);
  console.log(`[upload] Users running the installer will automatically download from this URL.`);
}

main().catch((err) => {
  console.error('[upload] Fatal error:', err);
  process.exit(1);
});
