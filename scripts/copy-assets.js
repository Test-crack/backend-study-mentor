// Copy non-TS runtime assets into dist/ after `tsc`.
//
// tsc only emits compiled .ts files; it does NOT copy .json (or other) assets.
// The exam-engine loader reads its config seed at runtime via
// readFileSync(path.join(__dirname, '...json')) — which resolves to
// dist/exam-engine/ in production. Without this copy the server crashes on
// startup with ENOENT. Keep this list in sync with any runtime readFileSync
// of a bundled asset.
const fs = require('fs');
const path = require('path');

const ASSETS = [
  'exam-engine/exam-engine-config.v2.json',
];

for (const rel of ASSETS) {
  const src = path.join(__dirname, '..', 'src', rel);
  const dest = path.join(__dirname, '..', 'dist', rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[copy-assets] ${src} -> ${dest}`);
}
