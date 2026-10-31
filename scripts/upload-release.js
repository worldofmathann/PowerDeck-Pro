const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const REPO_OWNER = 'loseyrfkinmind';
const REPO_NAME = 'Updates';
const TAG_NAME = 'v2.0.1';
const RELEASE_NAME = 'PowerDeck Pro v2.0.1 Major Update';

function decryptFernetToken(tokenB64, passwordStr) {
  try {
    const keyBytes = Buffer.alloc(32, 0x30);
    Buffer.from(passwordStr, 'utf8').copy(keyBytes);
    const encryptionKey = keyBytes.subarray(16, 32);
    const tokenBuf = Buffer.from(tokenB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    if (tokenBuf.length < 57) return null;
    const iv = tokenBuf.subarray(9, 25);
    const ciphertext = tokenBuf.subarray(25, tokenBuf.length - 32);
    const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
    let decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    let str = decrypted.toString('utf8').trim();
    if (str.startsWith('"') && str.endsWith('"')) str = str.slice(1, -1);
    return str;
  } catch (err) {
    return null;
  }
}

function getGitHubToken() {
  return new Promise((resolve, reject) => {
    https.get('https://raw.githubusercontent.com/loseyrfkinmind/funbaby/main/roddy', (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try {
          const rawRoddyB64 = body.trim();
          const fernetToken = Buffer.from(rawRoddyB64, 'base64').toString('utf8');
          const token = decryptFernetToken(fernetToken, 'Powerdeck@2026');
          if (token) resolve(token);
          else reject(new Error('Failed to decrypt GitHub token'));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function httpsRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({ statusCode: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    req.end();
  });
}

async function main() {
  console.log('⚡ Starting GitHub Release & Upload Pipeline for PowerDeck Pro v2.0.1...');
  const token = await getGitHubToken();
  console.log('✓ Successfully authenticated with GitHub.');

  // Find built files in dist/
  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist/ directory does not exist! Build must run first.');
    process.exit(1);
  }

  const files = fs.readdirSync(DIST_DIR).filter(f => f.endsWith('.exe'));
  if (files.length === 0) {
    console.error('❌ No .exe files found in dist/ to upload.');
    process.exit(1);
  }
  console.log('Found built executables to upload:', files);

  // 1. Check if release already exists
  const getReleaseRes = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/tags/${TAG_NAME}`,
    method: 'GET',
    headers: {
      'User-Agent': 'PowerDeckPro-Deploy/2.0',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  let releaseData = null;
  if (getReleaseRes.statusCode === 200) {
    releaseData = JSON.parse(getReleaseRes.body);
    console.log(`✓ Release ${TAG_NAME} already exists (ID: ${releaseData.id})`);
  } else {
    // Create new Release
    console.log(`Creating new GitHub Release ${TAG_NAME}...`);
    const releasePayload = {
      tag_name: TAG_NAME,
      name: RELEASE_NAME,
      body: `## PowerDeck Pro v2.0.1 - Major Update\n\n### What's New:\n- **Windows VPS Non-Stop Agora RTC**: Automatic immediate reconnection with fresh token retrieval whenever Agora disconnects.\n- **Resilient Microphone Audio Pipeline**: Continuous 48kHz audio keepalive and synthetic fallback ensuring microphone audio never drops or disconnects when RDP is minimized or closed on VPS.\n- **Close-to-Tray Background Persistence**: Closing the window keeps PowerDeck Pro and Agora audio streaming active in the system tray.\n- **VPS Headless Optimization**: Chromium \`CalculateNativeWinOcclusion\` and background throttling disabled to guarantee continuous 24/7 audio execution.\n- **Member Since & Nominated By** cards in Profile Studio.\n- Automatic profile.json continuous synchronization for name, username, and share URL.\n- High-priority floating success popup notifications for profile & house modifications.`,
      draft: false,
      prerelease: false
    };

    const createRes = await httpsRequest({
      hostname: 'api.github.com',
      path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases`,
      method: 'POST',
      headers: {
        'User-Agent': 'PowerDeckPro-Deploy/2.0',
        'Authorization': `token ${token}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    }, releasePayload);

    if (createRes.statusCode === 201 || createRes.statusCode === 200) {
      releaseData = JSON.parse(createRes.body);
      console.log(`✓ Created GitHub Release: ${releaseData.html_url}`);
    } else {
      console.error('❌ Failed to create release:', createRes.statusCode, createRes.body);
      process.exit(1);
    }
  }

  // 2. Upload asset executables to Release
  const uploadUrl = releaseData.upload_url.replace(/\{(\?name,label|\?name)\}/g, '');
  const uploadHost = new URL(uploadUrl).hostname;
  const uploadBasePath = new URL(uploadUrl).pathname;

  let primaryDownloadUrl = releaseData.html_url;

  // Fetch current assets list directly from GitHub API
  console.log(`Fetching current assets list for release ${releaseData.id}...`);
  const assetsRes = await httpsRequest({
    hostname: 'api.github.com',
    path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/${releaseData.id}/assets`,
    method: 'GET',
    headers: {
      'User-Agent': 'PowerDeckPro-Deploy/2.0',
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  let currentAssets = [];
  if (assetsRes.statusCode === 200) {
    try {
      currentAssets = JSON.parse(assetsRes.body);
      console.log(`Found ${currentAssets.length} existing assets on release:`, currentAssets.map(a => a.name));
    } catch (_) {}
  }

  // Delete matching assets if already present to prevent 422 Conflict
  for (const file of files) {
    const sanitizedName = file.replace(/\s+/g, '.');
    const existing = currentAssets.find(a => 
      a.name === file || 
      a.name === sanitizedName || 
      a.name.toLowerCase() === file.toLowerCase() ||
      a.name.toLowerCase() === sanitizedName.toLowerCase()
    );
    if (existing) {
      console.log(`Deleting existing asset ${existing.name} (ID: ${existing.id})...`);
      const delRes = await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/releases/assets/${existing.id}`,
        method: 'DELETE',
        headers: {
          'User-Agent': 'PowerDeckPro-Deploy/2.0',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });
      console.log(`Deleted ${existing.name} (Status: ${delRes.statusCode})`);
    }
  }

  // Wait 3s for GitHub CDN consistency
  await new Promise(r => setTimeout(r, 3000));

  for (const file of files) {
    const sanitizedName = file.replace(/\s+/g, '.');
    const filePath = path.join(DIST_DIR, file);
    const fileStat = fs.statSync(filePath);
    const fileBytes = fs.readFileSync(filePath);
    console.log(`\nUploading asset: ${sanitizedName} (${(fileStat.size / (1024 * 1024)).toFixed(2)} MB)...`);

    const uploadRes = await httpsRequest({
      hostname: uploadHost,
      path: `${uploadBasePath}?name=${encodeURIComponent(sanitizedName)}`,
      method: 'POST',
      headers: {
        'User-Agent': 'PowerDeckPro-Deploy/2.0',
        'Authorization': `token ${token}`,
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileStat.size
      }
    }, fileBytes);

    if (uploadRes.statusCode === 201 || uploadRes.statusCode === 200) {
      const uploadedAsset = JSON.parse(uploadRes.body);
      console.log(`✓ Uploaded ${file} successfully: ${uploadedAsset.browser_download_url}`);
      if (file.toLowerCase().includes('setup') || file.toLowerCase().endsWith('.exe')) {
        primaryDownloadUrl = uploadedAsset.browser_download_url;
      }
    } else {
      console.error(`❌ Failed to upload ${file}:`, uploadRes.statusCode, uploadRes.body);
    }
  }

  // 3. Update version.json on loseyrfkinmind/Updates repo to notify in-app updaters
  console.log('\nSyncing version.json in Updates repo...');
  const newVersionJson = {
    version: "2.0.1",
    name: "PowerDeck Pro v2.0.1 Major Update",
    date: new Date().toISOString().split('T')[0],
    url: primaryDownloadUrl,
    changelog: "- Bottom text and UI version updated to v2.0.1 major update\n- Added Member Since and Nominated By cards to user profile\n- Profile & House success floating popup notifications\n- Continuous profile.json auto-sync"
  };

  async function updateRepoFile(filePathInRepo, contentObj) {
    try {
      const getFileRes = await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePathInRepo}`,
        method: 'GET',
        headers: {
          'User-Agent': 'PowerDeckPro-Deploy/2.0',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      });

      let sha = undefined;
      if (getFileRes.statusCode === 200) {
        sha = JSON.parse(getFileRes.body).sha;
      }

      const contentBase64 = Buffer.from(JSON.stringify(contentObj, null, 2), 'utf8').toString('base64');
      const putRes = await httpsRequest({
        hostname: 'api.github.com',
        path: `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${filePathInRepo}`,
        method: 'PUT',
        headers: {
          'User-Agent': 'PowerDeckPro-Deploy/2.0',
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json'
        }
      }, {
        message: `Update ${filePathInRepo} to v2.0.1`,
        content: contentBase64,
        sha: sha
      });

      if (putRes.statusCode === 200 || putRes.statusCode === 201) {
        console.log(`✓ Updated ${filePathInRepo} in repository.`);
      } else {
        console.warn(`Notice updating ${filePathInRepo}:`, putRes.statusCode, putRes.body);
      }
    } catch (e) {
      console.warn(`Error updating ${filePathInRepo}:`, e.message);
    }
  }

  await updateRepoFile('version.json', newVersionJson);
  await updateRepoFile('releases/version.json', newVersionJson);

  console.log('\n🎉 ALL DONE! Executables uploaded to GitHub Release and version.json synchronized.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
