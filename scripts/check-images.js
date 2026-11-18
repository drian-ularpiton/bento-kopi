import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { localImage } from "./images.js";
const root = fileURLToPath(new URL("../", import.meta.url));
const cafes = JSON.parse(
  await readFile(new URL("../data/cafes.json", import.meta.url), "utf8"),
);
let missing = 0;
for (const cafe of cafes) {
  const photos = await Promise.all(
    (cafe.foto || []).map((photo) => localImage(root, cafe.slug, photo)),
  );
  if (!photos.some(Boolean)) {
    console.log(`[KAFE] ${cafe.nama}: belum punya foto lokal yang tersedia`);
    missing++;
  }
  for (let i = 0; i < photos.length; i++)
    if (!photos[i]) console.log(`  Referensi foto ke-${i + 1} tidak ditemukan`);
  for (const menu of cafe.menu_andalan || []) {
    if (!(await localImage(root, cafe.slug, menu.foto))) {
      console.log(`[MENU] ${cafe.nama} — ${menu.nama}: belum punya foto`);
      missing++;
    }
  }
}
console.log(
  `\n${cafes.length} kafe diperiksa; ${missing} entri belum punya foto.`,
);
// Missing drafts are informational. Unsafe paths or invalid JSON fail the command.
