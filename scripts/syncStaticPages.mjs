import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const distDir = path.join(rootDir, 'dist');
const distAssetsDir = path.join(distDir, 'assets');
const distIndexPath = path.join(distDir, 'index.html');

if (!fs.existsSync(distIndexPath) || !fs.existsSync(distAssetsDir)) {
  console.error('[syncStaticPages] Error: dist/ build output not found. Run vite build first.');
  process.exit(1);
}

const distAssetFiles = fs
  .readdirSync(distAssetsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);

const entryJs = distAssetFiles.find((name) => /^app-.*\.js$/.test(name));
const entryCss = distAssetFiles.find((name) => /^index-.*\.css$/.test(name));

if (!entryJs || !entryCss) {
  console.error('[syncStaticPages] Error: Could not locate entry app-*.js or index-*.css in dist/assets/.');
  process.exit(1);
}

const BUNDLE_EXT_RE = /\.(js|css|map|jpg|jpeg|png|svg|webp|woff2?)$/i;

function cleanTopLevelBundleFiles(targetAssetsDir) {
  fs.mkdirSync(targetAssetsDir, { recursive: true });
  for (const entry of fs.readdirSync(targetAssetsDir, { withFileTypes: true })) {
    if (entry.isFile() && BUNDLE_EXT_RE.test(entry.name)) {
      fs.unlinkSync(path.join(targetAssetsDir, entry.name));
    }
  }
}

function copyDistAssets(targetAssetsDir) {
  cleanTopLevelBundleFiles(targetAssetsDir);
  for (const file of distAssetFiles) {
    fs.copyFileSync(path.join(distAssetsDir, file), path.join(targetAssetsDir, file));
  }
  fs.copyFileSync(path.join(distAssetsDir, entryJs), path.join(targetAssetsDir, 'app.js'));
  fs.copyFileSync(path.join(distAssetsDir, entryCss), path.join(targetAssetsDir, 'index.css'));
}

// 1. Sync root /assets/ and /404.html (preserving /index.html markers required by vite.config.ts)
const rootAssetsDir = path.join(rootDir, 'assets');
copyDistAssets(rootAssetsDir);
fs.copyFileSync(distIndexPath, path.join(rootDir, '404.html'));

// 2. Sync /docs/ static Pages mirror (preserving /docs/assets/aistudio and .zip packages)
const docsDir = path.join(rootDir, 'docs');
const docsAssetsDir = path.join(docsDir, 'assets');
fs.mkdirSync(docsDir, { recursive: true });
copyDistAssets(docsAssetsDir);
fs.copyFileSync(distIndexPath, path.join(docsDir, 'index.html'));
fs.copyFileSync(distIndexPath, path.join(docsDir, '404.html'));

for (const publicFile of ['.nojekyll', 'icon.svg', 'manifest.json', 'sw.js']) {
  const srcPublic = path.join(rootDir, 'public', publicFile);
  if (fs.existsSync(srcPublic)) {
    fs.copyFileSync(srcPublic, path.join(docsDir, publicFile));
  }
}

console.log(
  `[syncStaticPages] Synced ${distAssetFiles.length} Vite assets (${entryJs}, ${entryCss}) to /assets/, /404.html, and /docs/.`
);
