import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { parseHours, isOpen, matches, similar } from "../src/shared.js";
import { localImage, optimize } from "../scripts/images.js";
const cafes = JSON.parse(
  await readFile(new URL("../data/cafes.json", import.meta.url), "utf8"),
);
const generated = (file) =>
  readFile(new URL("../dist/" + file, import.meta.url), "utf8");
const at = (value) => new Date(value + "+07:00");

test("Jam lewat tengah malam memakai WIB dan jadwal hari sebelumnya", () => {
  const hours = parseHours("Sen-Jum 08:00-23:00; Sab-Min 08:00-02:00");
  assert.equal(isOpen(hours, at("2026-11-16T01:59:00")), true);
  assert.equal(isOpen(hours, at("2026-11-16T02:00:00")), false);
  assert.equal(isOpen(hours, at("2026-11-16T07:59:00")), false);
  assert.equal(isOpen(hours, at("2026-11-16T08:00:00")), true);
  assert.equal(isOpen(hours, at("2026-11-16T23:00:00")), false);
});
test("Pengecualian Kamis dan interval 24 jam", () => {
  const hours = parseHours("Setiap hari 08:00-23:00 (Kamis buka 07:00)");
  assert.equal(isOpen(hours, at("2026-11-19T07:30:00")), true);
  assert.equal(isOpen(hours, at("2026-11-20T07:30:00")), false);
  assert.equal(
    isOpen(parseHours("Buka 24 jam"), at("2026-11-16T00:00:00")),
    true,
  );
  const mixed = parseHours(
    "Sen, Rab, Kam, Sab 08:00-00:00; Selasa 24 jam; Jum & Min 08:00-02:00",
  );
  assert.equal(isOpen(mixed, at("2026-11-17T00:00:00")), true);
  assert.equal(isOpen(mixed, at("2026-11-18T01:00:00")), false);
});
test("Parser menolak format ambigu, hari tak lengkap, dan jam tidak valid", () => {
  for (const value of [
    null,
    "",
    "Sampai habis",
    "Setiap hari 09:00-25:00",
    "Sen 09:00-22:00",
    "Setiap hari 08:00-08:00",
    "Setiap hari 09:00-22:00 (libur berubah)",
  ])
    assert.equal(parseHours(value), null);
  assert.equal(isOpen(null), null);
});
test("Filter gabungan, pencarian label, hasil kosong, dan reset", () => {
  const data = {
    nama: "Café Test",
    area: "Sumbersari",
    suasana: ["nugas", "24-jam"],
    fasilitas: ["wifi", "outdoor"],
    kisaran_harga: "Rp",
    jam_buka: "Buka 24 jam",
  };
  assert.equal(
    matches(data, {
      q: "cafe",
      area: "Sumbersari",
      suasana: "nugas",
      fasilitas: "wifi",
      harga: "Rp",
      buka: "1",
    }),
    true,
  );
  assert.equal(matches(data, { q: "Buka 24 jam" }), true);
  assert.equal(matches(data, { q: "Luar ruangan" }), true);
  assert.equal(matches(data, { area: "Patrang" }), false);
  assert.equal(matches(data, { fasilitas: "colokan" }), false);
  assert.equal(matches(data, { q: "tidak-ada" }), false);
  assert.equal(matches(data, {}), true);
});
test("Rekomendasi berjumlah tiga, unik, dan tidak merekomendasikan diri sendiri", () => {
  for (const cafe of cafes) {
    const result = similar(cafe, cafes);
    assert.equal(result.length, Math.min(3, cafes.length - 1));
    assert.equal(new Set(result.map((x) => x.slug)).size, result.length);
    assert.ok(result.every((x) => x.slug !== cafe.slug));
  }
});
test("Semua halaman detail, JSON-LD, catatan kekurangan, serta nilai kosong aman", async () => {
  for (const cafe of cafes) {
    const html = await generated(`kafe/${cafe.slug}/index.html`);
    assert.ok(html.includes("Terakhir diperbarui:"));
    if (/draf/i.test(cafe.status_data))
      assert.ok(html.includes("Info belum diverifikasi"));
    assert.ok(!html.includes(cafe.status_data));
    assert.ok(!/Rp\s*0|>N\/A</.test(html));
    if (!cafe.instagram) assert.ok(!html.includes(">Instagram ↗"));
    if (!cafe.kontak) assert.ok(!html.includes('href="tel:'));
    if (!cafe.menu_andalan?.length)
      assert.ok(html.includes("Menu belum ditambahkan."));
    const schema = JSON.parse(
      html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1],
    );
    assert.equal(schema.name, cafe.nama);
    assert.equal(schema["@type"], "CafeOrCoffeeShop");
    assert.ok(!schema.aggregateRating && !schema.review && !schema.offers);
    assert.ok(!/<(?:img|script)[^>]*src="https?:\/\//i.test(html));
    assert.ok(!/<iframe/i.test(html));
    for (const note of [
      "parkir agak sulit",
      "colokan terbatas",
      "musik cukup keras",
      "akses masuk dengan mobil agak sulit",
    ]) {
      if (cafe.daya_tarik.includes(note)) assert.ok(html.includes(note));
    }
  }
});
test("Data keluaran tetap sama byte demi byte, SEO, 404, dan kontak placeholder", async () => {
  const original = await readFile(
    new URL("../data/cafes.json", import.meta.url),
  );
  const output = await readFile(new URL("../dist/cafes.json", import.meta.url));
  assert.deepEqual(output, original);
  const home = await generated("index.html");
  assert.ok(home.includes(`${cafes.length} kafe ditemukan`));
  assert.equal(
    (await generated("sitemap.xml")).match(/<loc>/g).length,
    cafes.length + 2,
  );
  assert.ok((await generated("404.html")).includes("noindex"));
  const about = await generated("tentang/index.html");
  if (!/^\d{8,15}$/.test(process.env.WHATSAPP_NUMBER || "")) {
    assert.ok(about.includes("[ISI: nomor WA]"));
    assert.ok(!about.includes('href="https://wa.me/'));
  }
});
test("Optimasi gambar lokal menghasilkan WebP berukuran benar tanpa fetch luar", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "bento-images-"));
  try {
    const source = path.join(temp, "public/images/sample");
    await mkdir(source, { recursive: true });
    await sharp({
      create: { width: 1800, height: 1200, channels: 3, background: "#ded4bb" },
    })
      .png()
      .toFile(path.join(source, "front.png"));
    const result = await optimize(
      temp,
      "sample",
      "front.png",
      path.join(temp, "dist"),
    );
    assert.deepEqual(
      result.variants.map((x) => x.width),
      [480, 960, 1440],
    );
    assert.equal(result.height, 960);
    const meta = await sharp(path.join(temp, "dist", result.src)).metadata();
    assert.equal(meta.format, "webp");
    assert.equal(await localImage(temp, "sample", "missing.jpg"), null);
    await assert.rejects(
      localImage(temp, "sample", "https://example.com/a.jpg"),
    );
    await assert.rejects(localImage(temp, "sample", "../outside.jpg"));
    await assert.rejects(localImage(temp, "sample", "/etc/passwd"));
    await writeFile(path.join(source, "invalid.jpg"), "broken");
    await assert.rejects(
      optimize(temp, "sample", "invalid.jpg", path.join(temp, "dist")),
    );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
