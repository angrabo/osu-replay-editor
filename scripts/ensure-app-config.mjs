// tauri.conf.json bundles app.config.json as a resource, and the Tauri Rust build validates
// that path exists even for plain `cargo check`/`tauri dev` — not just release bundling. Every
// entry point runs `npm install` first, so a postinstall hook is the one place that can
// guarantee the file is there for everyone, without committing real credentials.
import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'app.config.json');
const template = join(root, 'app.config.example.json');

if (!existsSync(target)) {
  copyFileSync(template, target);
  console.log('Created app.config.json from app.config.example.json (fill in osu.clientId/clientSecret to sign in).');
}
