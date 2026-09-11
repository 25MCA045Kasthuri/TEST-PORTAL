// Vercel requires static assets in a top-level `public/` directory.
// This copies the built React app (frontend/dist) into public/ after the build.
import { rmSync, mkdirSync, cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'frontend', 'dist');
const dest = path.join(root, 'public');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
// eslint-disable-next-line no-console
console.log(`[static] copied ${src} -> public/`);