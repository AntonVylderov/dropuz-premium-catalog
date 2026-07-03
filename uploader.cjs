const fs = require('fs');
const path = require('path');
const https = require('https');

// Load token from environment
const TOKEN = process.env.GITHUB_TOKEN;
const REPO = 'dropuz-premium-catalog';
const USER = 'AntonVylderov';

if (!TOKEN) {
  console.error('ERROR: GITHUB_TOKEN not found in environment');
  console.error('Set it in .env file or export GITHUB_TOKEN=your_token');
  process.exit(1);
}

function getFiles(dir, files_ = []) {
  const files = fs.readdirSync(dir);
  for (const i in files) {
    const name = path.join(dir, files[i]);
    if (name.includes('node_modules') || name.includes('.git') || name.includes('.stackblitz') || name.includes('uploader.js')) continue;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files_);
    } else {
      files_.push(name);
    }
  }
  return files_;
}

async function uploadToGithub(filePath) {
  const relativePath = path.relative('.', filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, { encoding: 'base64' });

  const data = JSON.stringify({
    message: 'prod: commit file ' + relativePath,
    content: content,
    branch: 'main'
  });

  const options = {
    hostname: 'api.github.com',
    path: `/repos/${USER}/${REPO}/contents/${relativePath}`,
    method: 'PUT',
    headers: {
      'Authorization': `token ${TOKEN}`,
      'User-Agent': 'NodeJS-Script',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    }
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      if (res.statusCode === 201 || res.statusCode === 200) {
        console.log('✓ Uploaded: ' + relativePath);
      } else {
        console.log('✕ Error ' + relativePath + ': Status ' + res.statusCode);
      }
      resolve();
    });
    req.on('error', (e) => {
      console.error('Error: ' + filePath, e);
      resolve();
    });
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('Scanning files...');
  const allFiles = getFiles('.');
  console.log(`Found ${allFiles.length} files to upload.`);

  for (const file of allFiles) {
    await uploadToGithub(file);
  }
  console.log('=== Upload completed! ===');
}

main();
