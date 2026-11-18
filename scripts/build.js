import { readFile, writeFile, mkdir, rm, copyFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  label,
  moods,
  facilities,
  parseHours,
  similar,
} from "../src/shared.js";
import { optimize } from "./images.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const cafes = JSON.parse(
  await readFile(path.join(root, "data/cafes.json"), "utf8"),
);
const siteUrl = (process.env.SITE_URL || "http://localhost:8080").replace(
  /\/$/,
  "",
);
if (!/^https?:\/\/[^/]+$/.test(siteUrl))
  throw new Error(
    "SITE_URL harus berupa origin, contoh https://kopi.example.com",
  );
const waNumber = process.env.WHATSAPP_NUMBER || "083115462016";
const waReady = /^\d{8,15}$/.test(waNumber);
const e = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const json = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const safeUrl = (value) =>
  typeof value === "string" && /^https?:\/\//i.test(value) ? e(value) : "";
const rupiah = (value) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
const dateLabel = (value) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value || "")
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(value))
    : value;
const priceLegend =
  "Rp / RpRp adalah kategori kasar biaya, bukan harga pasti. RpRp menunjukkan kategori lebih tinggi daripada Rp; nominalnya belum ditetapkan.";
const seen = new Set();
for (const cafe of cafes) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(cafe.slug) || seen.has(cafe.slug))
    throw new Error(`Slug tidak valid/duplikat: ${cafe.slug}`);
  if (!cafe.nama || !["Rp", "RpRp"].includes(cafe.kisaran_harga))
    throw new Error(`Nama/kategori harga tidak valid: ${cafe.slug}`);
  seen.add(cafe.slug);
}
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
const sources = [
  "src/style.css",
  "src/client.js",
  "src/shared.js",
  "public/fonts/fraunces.woff2",
  "public/fonts/dm-sans.woff2",
  "public/fonts/Fraunces-LICENSE.txt",
  "public/fonts/DM-Sans-LICENSE.txt",
];
const buffers = await Promise.all(
  sources.map((file) => readFile(path.join(root, file))),
);
const hash = createHash("sha256");
buffers.forEach((bytes) => hash.update(bytes));
const assetBase = `/assets/${hash.digest("hex").slice(0, 12)}`;
await mkdir(path.join(dist, assetBase), { recursive: true });
for (let i = 0; i < sources.length; i++)
  await writeFile(
    path.join(dist, assetBase, path.basename(sources[i])),
    buffers[i],
  );
const images = new Map();
for (const cafe of cafes) {
  const gallery = [];
  for (const photo of cafe.foto || []) {
    const result = await optimize(root, cafe.slug, photo, dist);
    if (result) gallery.push(result);
  }
  const menu = [];
  for (const item of cafe.menu_andalan || [])
    menu.push(await optimize(root, cafe.slug, item.foto, dist));
  images.set(cafe.slug, { gallery, menu });
}
const tags = (values) =>
  `<ul class="tags">${(values || []).map((value) => `<li>${e(label(value))}</li>`).join("")}</ul>`;
function photo(image, alt, { eager = false, className = "photo" } = {}) {
  return `<img class="${className}" src="${image.src}" srcset="${image.variants.map((v) => `${v.src} ${v.width}w`).join(", ")}" sizes="${className === "menu-photo" ? "80px" : "(max-width: 699px) 100vw, 65vw"}" width="${image.width}" height="${image.height}" alt="${e(image.alt || alt)}" loading="${eager ? "eager" : "lazy"}" ${eager ? 'fetchpriority="high"' : ""} decoding="async">`;
}
function placeholder(cafe, index, view = "tampak depan") {
  const initials = cafe.nama
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0])
    .join("")
    .toUpperCase();
  return `<div class="placeholder tone-${index % 4}" role="img" aria-label="Foto ${e(view)} ${e(cafe.nama)} belum tersedia"><div class="placeholder-top"><span>${e(cafe.area || "Jember")}</span><span>${String(index + 1).padStart(2, "0")} / BK</span></div><span class="placeholder-monogram" aria-hidden="true">${e(initials)}</span><div class="placeholder-bottom"><strong>FOTO: ${e(view)}</strong><span>Dokumentasi belum tersedia</span></div></div>`;
}
function card(cafe, index) {
  const first = images.get(cafe.slug).gallery[0];
  return `<article class="cafe-card" data-cafe="${cafe.slug}"><a class="card-image-link" href="/kafe/${cafe.slug}/" aria-label="Lihat ${e(cafe.nama)}" tabindex="-1">${first ? `<div class="media">${photo(first, `Foto ${cafe.nama}`, { eager: index === 0 })}</div>` : placeholder(cafe, index)}</a><div class="card-meta"><span>${e(cafe.area)}</span><span>${e(cafe.kisaran_harga)}</span></div><h3><a href="/kafe/${cafe.slug}/">${e(cafe.nama)}</a></h3><p>${e(cafe.deskripsi_singkat)}</p>${tags(cafe.suasana)}</article>`;
}
function layout({
  title,
  description,
  route,
  body,
  schema,
  image,
  script = false,
  current = "",
  noindex = false,
}) {
  return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5efdf"><title>${e(title)}</title><meta name="description" content="${e(description)}">${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${e(siteUrl + route)}">`}<meta property="og:type" content="website"><meta property="og:locale" content="id_ID"><meta property="og:site_name" content="K2"><meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:url" content="${e(siteUrl + route)}">${image ? `<meta property="og:image" content="${e(siteUrl + image.src)}"><meta property="og:image:width" content="${image.width}"><meta property="og:image:height" content="${image.height}">` : ""}<link rel="preload" href="${assetBase}/fraunces.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${assetBase}/style.css">${schema ? `<script type="application/ld+json">${json(schema)}</script>` : ""}${script ? `<script type="module" src="${assetBase}/client.js"></script>` : ""}</head>
<body><a class="skip" href="#main">Langsung ke isi</a><header class="site-header"><div class="wrap header-inner"><a class="brand" href="/" aria-label="K2 — beranda"><span class="brand-mark" aria-hidden="true">2.</span><span class="brand-name">K2</span></a><nav class="site-nav" aria-label="Navigasi utama"><a href="/" ${current === "home" ? 'aria-current="page"' : ""}>Jelajah kafe</a><a href="/tentang/" ${current === "about" ? 'aria-current="page"' : ""}>Tentang</a></nav></div></header><main id="main" class="wrap">${body}</main><footer class="site-footer"><div class="wrap footer-inner"><div><a class="footer-title" href="/">K2</a><p>Catatan kafe & kedai kopi di Jember.</p></div><div><p>Kenali tempatnya. Cek sebelum berangkat.</p><a href="/tentang/#koreksi">Usulkan tempat atau koreksi info ↗</a></div></div></footer></body></html>`;
}
async function page(file, content) {
  const target = path.join(dist, file);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, content);
}
const areas = [...new Set(cafes.map((c) => c.area).filter(Boolean))].sort();
const canFilterOpen = cafes.every((c) => parseHours(c.jam_buka) !== null);
const options = (values, first, display = (x) => x) =>
  `<option value="">${first}</option>${values.map((x) => `<option value="${e(x)}">${e(display(x))}</option>`).join("")}`;
await page(
  "index.html",
  layout({
    title: "K2 — Panduan Kafe & Kedai Kopi di Jember",
    description:
      "Cari kafe di Jember berdasarkan area, suasana, fasilitas, dan kategori harga. Baca menu serta catatan tempat sebelum berangkat.",
    route: "/",
    script: true,
    current: "home",
    body: `<section class="hero"><div><div class="eyebrow">Jember, Jawa Timur · Panduan kafe</div><h1>Mau ngopi<br><span>di mana?</span></h1></div><div class="hero-note"><div class="edition"><span>${String(cafes.length).padStart(2, "0")}</span><span class="eyebrow">Tempat dalam<br>catatan kami</span></div><p>Dari sekitar kampus sampai ${e(areas.join(", ").replace(/, ([^,]*)$/, ", dan $1"))}, cari tempat di Jember yang pas buat rencanamu. Lihat suasana, menu, dan catatan praktisnya sebelum berangkat.</p></div></section>
<form id="filters" class="filters" role="search" aria-label="Cari dan saring kafe"><div class="filter-top"><div class="search-box"><label for="q">Cari tempat yang kamu tuju</label><input id="q" name="q" type="search" placeholder="Nama kafe, area, atau suasana…" autocomplete="off"></div><div class="select-fields"><div class="select-field"><label for="area">Area</label><select id="area" name="area">${options(areas, "Semua area")}</select></div><div class="select-field"><label for="fasilitas">Fasilitas</label><select id="fasilitas" name="fasilitas">${options(facilities, "Semua fasilitas", label)}</select></div><div class="select-field"><label for="harga">Kisaran harga</label><select id="harga" name="harga" aria-describedby="price-legend">${options(["Rp", "RpRp"], "Semua kategori")}</select></div></div></div><div class="filter-bottom"><fieldset class="mood-field"><legend>Lagi ingin suasana apa?</legend><div class="chips">${["", ...moods].map((value) => `<label class="chip"><input type="radio" name="suasana" value="${value}" ${value === "" ? "checked" : ""}><span>${value ? e(label(value)) : "Apa saja"}</span></label>`).join("")}</div></fieldset><label class="open-check" ${canFilterOpen ? "" : "hidden"}><input type="checkbox" name="buka" value="1" ${canFilterOpen ? "" : "disabled"} aria-describedby="hours-note">Buka sekarang · WIB</label><button class="reset" type="reset">Reset filter</button></div><p id="price-legend" class="legend">${priceLegend}</p>${canFilterOpen ? '<p id="hours-note" class="legend">“Buka sekarang” mengikuti jadwal dalam data, bukan konfirmasi langsung. Jam buka bisa berubah.</p>' : ""}</form><noscript><p class="noscript">Semua kafe tetap bisa dilihat. Aktifkan JavaScript untuk memakai pencarian dan filter.</p></noscript>
<section aria-labelledby="result-count"><div class="results-heading"><h2 id="result-count" role="status" aria-live="polite" aria-atomic="true">${cafes.length} kafe ditemukan</h2><span>Jelajah, lalu mampir ↘</span></div><div class="bento">${cafes.map(card).join("")}</div><div id="empty" class="empty" hidden><h3>Belum ada yang cocok.</h3><p>Coba kata lain, pilih area berbeda, atau longgarkan filternya.</p><button id="empty-reset" class="button" type="button">Tampilkan semua kafe</button></div></section><aside class="editor-note"><h2>Catatan kecil,<br>sebelum mampir.</h2><p>Panduan ini masih dirapikan.ebagian informasi belum tersedia; data kafe belum diverifikasi langsung. Catatan seperti parkir sulit atau colokan terbatas tetap kami sertakan supaya kamu bisa memilih dengan lebih jelas. <a href="/tentang/">Tentang panduan ini ↗</a></p></aside><script id="cafe-data" type="application/json">${json(cafes.map(({ slug, nama, area, suasana, fasilitas, kisaran_harga, jam_buka }) => ({ slug, nama, area, suasana, fasilitas, kisaran_harga, jam_buka })))}</script>`,
  }),
);

for (const [index, cafe] of cafes.entries()) {
  const { gallery, menu } = images.get(cafe.slug);
  const route = `/kafe/${cafe.slug}/`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "CafeOrCoffeeShop",
    name: cafe.nama,
    url: siteUrl + route,
  };
  if (cafe.deskripsi_singkat) schema.description = cafe.deskripsi_singkat;
  if (cafe.alamat) schema.address = cafe.alamat;
  if (cafe.kisaran_harga) schema.priceRange = cafe.kisaran_harga;
  if (cafe.kontak) schema.telephone = cafe.kontak;
  if (
    Number.isFinite(cafe.koordinat?.lat) &&
    Number.isFinite(cafe.koordinat?.lng)
  )
    schema.geo = {
      "@type": "GeoCoordinates",
      latitude: cafe.koordinat.lat,
      longitude: cafe.koordinat.lng,
    };
  if (safeUrl(cafe.maps_url)) schema.hasMap = cafe.maps_url;
  const sameAs = [cafe.instagram, cafe.tautan_lain].filter(safeUrl);
  if (sameAs.length) schema.sameAs = sameAs;
  if (gallery.length) schema.image = gallery.map((p) => siteUrl + p.src);
  const schedule = parseHours(cafe.jam_buka);
  if (schedule)
    schema.openingHoursSpecification = schedule.map(([start, end], d) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: `https://schema.org/${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d]}`,
      opens: `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`,
      closes:
        start === 0 && end === 1440
          ? "23:59"
          : `${String(Math.floor((end % 1440) / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`,
    }));
  const practical = [
    ["Alamat", cafe.alamat],
    ["Jam buka · WIB", cafe.jam_buka],
    ["Kisaran harga", cafe.kisaran_harga],
  ]
    .filter(([, value]) => value)
    .map(([name, value]) => `<dt>${name}</dt><dd>${e(value)}</dd>`)
    .join("");
  const contacts = [
    safeUrl(cafe.instagram)
      ? `<a href="${safeUrl(cafe.instagram)}" rel="noopener noreferrer" target="_blank">Instagram ↗</a>`
      : "",
    safeUrl(cafe.tautan_lain)
      ? `<a href="${safeUrl(cafe.tautan_lain)}" rel="noopener noreferrer" target="_blank">Tautan lainnya ↗</a>`
      : "",
    cafe.kontak
      ? `<a href="tel:${e(cafe.kontak.replace(/[^+\d]/g, ""))}">Hubungi ${e(cafe.kontak)}</a>`
      : "",
  ].join("");
  await page(
    `kafe/${cafe.slug}/index.html`,
    layout({
      title: `${cafe.nama} — Kafe di ${cafe.area} | K2`,
      description:
        cafe.deskripsi_singkat ||
        `Informasi ${cafe.nama} di ${cafe.area}, Jember.`,
      route,
      schema,
      image: gallery[0],
      script: true,
      body: `<nav class="breadcrumb" aria-label="Jejak navigasi"><a href="/">Jelajah kafe</a> / ${e(cafe.area)}</nav><header class="detail-heading"><div class="eyebrow">${e(cafe.area)} · ${e(cafe.kisaran_harga)}</div><h1>${e(cafe.nama)}</h1><p class="intro">${e(cafe.deskripsi_singkat)}</p>${tags(cafe.suasana)}${/draf/i.test(cafe.status_data || "") ? '<span class="badge">Info belum diverifikasi</span>' : ""}${cafe.terakhir_diperbarui ? `<span class="updated">Terakhir diperbarui: <time datetime="${e(cafe.terakhir_diperbarui)}">${e(dateLabel(cafe.terakhir_diperbarui))}</time></span>` : ""}</header><div class="gallery" aria-label="Galeri ${e(cafe.nama)}">${gallery.length ? gallery.map((p, i) => `<figure>${photo(p, `Foto ${i + 1} ${cafe.nama}`, { eager: i === 0 })}</figure>`).join("") : ["tampak depan", "suasana tempat", "sudut kedai"].map((view, i) => `<figure>${placeholder(cafe, index + i, view)}</figure>`).join("")}</div>${cafe.sumber_foto ? `<p class="credit">Kredit foto: ${e(Array.isArray(cafe.sumber_foto) ? cafe.sumber_foto.join(", ") : cafe.sumber_foto)}</p>` : ""}
<div class="detail-layout"><div class="detail-copy">${cafe.daya_tarik ? `<section><h2>Yang perlu kamu tahu</h2><p>${e(cafe.daya_tarik)}</p></section>` : ""}<section><h2>Menu yang disebut</h2>${cafe.menu_andalan?.length ? `<ul class="menu-list">${cafe.menu_andalan.map((item, i) => `<li>${menu[i] ? photo(menu[i], item.nama, { className: "menu-photo" }) : ""}<div><strong>${e(item.nama)}</strong>${item.catatan ? `<p>${e(item.catatan)}</p>` : ""}</div>${item.harga !== null && item.harga !== undefined && item.harga !== "" ? `<span class="menu-price">${e(typeof item.harga === "number" ? rupiah(item.harga) : item.harga)}</span>` : ""}</li>`).join("")}</ul>` : "<p>Menu belum ditambahkan.</p>"}</section></div><aside class="practical"><h2>Sebelum berangkat</h2><p class="open-status" data-hours="${e(cafe.jam_buka)}" hidden></p><dl>${practical}<dt>Fasilitas tercatat</dt><dd>${cafe.fasilitas?.length ? tags(cafe.fasilitas) : "Informasi fasilitas belum ditambahkan."}</dd></dl><p class="legend">${priceLegend}</p><p class="legend">Jadwal masih perlu dikonfirmasi sebelum berkunjung.</p>${safeUrl(cafe.maps_url) ? `<a class="button" href="${safeUrl(cafe.maps_url)}" target="_blank" rel="noopener noreferrer">Buka di Google Maps ↗</a>` : ""}${contacts ? `<div class="contact-links">${contacts}</div>` : ""}</aside></div><section class="related"><h2>Masih ingin lihat-lihat?</h2><p>Kafe serupa berdasarkan kesamaan suasana dan area.</p><div class="bento">${similar(cafe, cafes).map(card).join("")}</div></section>`,
    }),
  );
}
await page(
  "tentang/index.html",
  layout({
    title: "Tentang K2 — Catatan Kafe Jember",
    description:
      "Kenali K2, panduan kafe Jember yang masih berkembang. Baca cara mengusulkan tempat dan mengoreksi informasi.",
    route: "/tentang/",
    current: "about",
    body: `<article class="article"><div class="eyebrow">Tentang panduan ini</div><h1>Kenali tempatnya.<br>Baru tentukan tujuan.</h1><p>K2 adalah direktori kafe dan kedai kopi di Jember, Jawa Timur. Di sini kamu bisa mencari tempat untuk nugas, ngobrol, atau duduk santai, lalu membaca apa yang tersedia di sana.</p><section><h2>Catatan yang jujur, termasuk kekurangannya.</h2><p>Data yang tersedia masih draf. Sebagian berasal dari catatan pengunjung dan belum diverifikasi langsung. Kami mempertahankan keterangan seperti parkir sulit, musik keras, atau colokan terbatas; kebutuhan tiap orang berbeda.</p><p>Foto kosong berarti dokumentasinya belum tersedia. Harga menu yang belum diketahui tidak ditampilkan. Label Rp dan RpRp hanya kategori kasar, bukan angka harga atau jaminan murah. Jam buka mengikuti data dan bisa berubah.</p></section><section><h2>Panduan, bukan tempat memesan.</h2><p>K2 tidak menyediakan transaksi atau pemesanan. Gunakan tautan kontak kafe dan Google Maps yang tersedia untuk mencari informasi lebih lanjut.</p></section><section id="koreksi"><h2>Ada tempat yang terlewat?</h2><p>Untuk mengusulkan kafe atau mengoreksi data, sertakan nama kafe, alamat, informasi yang perlu diperbaiki, tanggal pengecekan, dan sumbernya. Untuk foto, sertakan izin penggunaan serta nama pemilik foto yang harus dicantumkan.</p><div class="contact-placeholder">${waReady ? `<a class="button" href="https://wa.me/${waNumber}?text=${encodeURIComponent("Halo, saya ingin mengusulkan atau mengoreksi data kafe di K2.")}" target="_blank" rel="noopener noreferrer">Usulkan atau koreksi lewat WhatsApp ↗</a>` : '<a aria-disabled="true" role="link">WhatsApp: [ISI: nomor WA]</a><p>Nomor pengelola belum tersedia. Kanal usulan dan koreksi belum aktif.</p>'}</div></section></article>`,
  }),
);
await page(
  "404.html",
  layout({
    title: "Halaman Tidak Ditemukan | K2",
    description:
      "Halaman ini belum ada di panduan K2. Kembali jelajahi kafe di Jember.",
    route: "/404.html",
    noindex: true,
    body: '<section class="notfound"><div class="number" aria-hidden="true">404</div><h1>Sepertinya salah belok.</h1><p>Halaman yang kamu cari tidak ada. Daftar kafenya masih bisa kamu jelajahi.</p><a class="button" href="/">Kembali jelajah kafe ↗</a></section>',
  }),
);
const routes = ["/", "/tentang/", ...cafes.map((c) => `/kafe/${c.slug}/`)];
await page(
  "sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${routes.map((route) => `<url><loc>${e(siteUrl + route)}</loc></url>`).join("")}</urlset>`,
);
await page(
  "robots.txt",
  `User-agent: *\nAllow: /\nSitemap: ${siteUrl}/sitemap.xml\n`,
);
await copyFile(
  path.join(root, "data/cafes.json"),
  path.join(dist, "cafes.json"),
);
console.log(
  `Build selesai: ${cafes.length} halaman kafe + beranda, tentang, 404. Filter buka sekarang: ${canFilterOpen ? "aktif (WIB)" : "disembunyikan: format jadwal tidak dikenali"}.`,
);
