// Mağaza yapısının anahtar İÇERMEDİĞİNİ doğrular (proxy geçişi sonrası kullanım).
// Kullanım: önce .env'deki VITE_SHARED_GROQ_KEY satırını boşaltıp
// `npm run package` çalıştırın, sonra `npm run verify-dist`.
// dist/ içinde gsk_... desenine uyan bir şey varsa 1 ile çıkar.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pattern = /gsk_[A-Za-z0-9_-]{8,}/;
const hits = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
    } else if (/\.(js|html|json|css|map)$/.test(full)) {
      try {
        if (pattern.test(readFileSync(full, 'utf8'))) hits.push(full);
      } catch { /* binary — geç */ }
    }
  }
}

try {
  walk('dist');
} catch {
  console.error('dist/ bulunamadı. Önce `npm run build` çalıştırın.');
  process.exit(1);
}

if (hits.length > 0) {
  console.error('LEAK IN DIST — gömülü anahtar bulundu:');
  for (const file of hits) console.error(' - ' + file);
  process.exit(1);
}
console.log('dist clean: gömülü anahtar yok.');
