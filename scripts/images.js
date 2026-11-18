import { readFile, realpath, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
export function imageValue(value) {
  return typeof value === "string" ? value : value?.src;
}
export async function localImage(root, slug, value) {
  const src = imageValue(value);
  if (!src) return null;
  // Only files within public/images/<slug>/ are accepted; no network fetches.
  if (/^(?:[a-z]+:|\/\/)/i.test(src) || src.includes("\\"))
    throw new Error(`Gambar eksternal/tidak valid: ${slug}: ${src}`);
  const base = path.resolve(root, "public/images", slug);
  const relative = src.startsWith(`/images/${slug}/`)
    ? src.slice(`/images/${slug}/`.length)
    : src;
  const file = path.resolve(base, relative);
  if (!file.startsWith(base + path.sep))
    throw new Error(`Gambar keluar folder kafe: ${src}`);
  if (!/\.(jpe?g|png|webp|avif)$/i.test(file))
    throw new Error(`Format gambar tidak didukung: ${src}`);
  try {
    const actual = await realpath(file);
    if (!actual.startsWith(base + path.sep))
      throw new Error(`Symlink keluar folder kafe: ${src}`);
    return actual;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}
export async function optimize(root, slug, value, dist) {
  const file = await localImage(root, slug, value);
  if (!file) return null;
  const bytes = await readFile(file);
  const hash = createHash("sha256")
    .update(bytes)
    .update("webp-v1-82")
    .digest("hex")
    .slice(0, 12);
  const dir = path.join(dist, "images", slug);
  await mkdir(dir, { recursive: true });
  const variants = [];
  for (const width of [480, 960, 1440]) {
    const name = `${hash}-${width}.webp`;
    const info = await sharp(bytes)
      .rotate()
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toFile(path.join(dir, name));
    if (!variants.some((x) => x.width === info.width))
      variants.push({
        src: `/images/${slug}/${name}`,
        width: info.width,
        height: info.height,
      });
  }
  return {
    ...variants.at(-1),
    variants,
    alt: typeof value === "object" ? value.alt : null,
  };
}
