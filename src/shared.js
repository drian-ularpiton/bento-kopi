export const labels = {
  nugas: "Nugas",
  nongkrong: "Nongkrong",
  outdoor: "Luar ruangan",
  "live-music": "Musik langsung",
  keluarga: "Keluarga",
  rooftop: "Atap terbuka",
  "24-jam": "Buka 24 jam",
  tenang: "Tenang",
  wifi: "WiFi",
  colokan: "Colokan",
  parkir: "Parkir",
  ac: "AC",
  musala: "Musala",
  toilet: "Toilet",
  "smoking-area": "Area merokok",
  "non-smoking": "Area bebas rokok",
  "ruang-meeting": "Ruang rapat",
  photobox: "Bilik foto",
  indoor: "Dalam ruangan",
};
export const moods = [
  "nugas",
  "nongkrong",
  "outdoor",
  "live-music",
  "keluarga",
  "rooftop",
  "24-jam",
  "tenang",
];
export const facilities = [
  "wifi",
  "colokan",
  "parkir",
  "ac",
  "musala",
  "toilet",
  "smoking-area",
  "non-smoking",
  "ruang-meeting",
  "photobox",
  "indoor",
  "outdoor",
];
export const label = (value) => labels[value] || value;
export const normalize = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
export function matches(cafe, filters, date = new Date()) {
  const search = [
    cafe.nama,
    cafe.area,
    ...(cafe.suasana || []),
    ...(cafe.fasilitas || []),
    ...(cafe.suasana || []).map(label),
    ...(cafe.fasilitas || []).map(label),
  ].join(" ");
  return (
    normalize(search).includes(normalize(filters.q).trim()) &&
    (!filters.area || cafe.area === filters.area) &&
    (!filters.suasana || cafe.suasana?.includes(filters.suasana)) &&
    (!filters.fasilitas || cafe.fasilitas?.includes(filters.fasilitas)) &&
    (!filters.harga || cafe.kisaran_harga === filters.harga) &&
    (!filters.buka || isOpen(parseHours(cafe.jam_buka), date) === true)
  );
}
const days = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
const fullDays = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
function daySet(text) {
  if (text === "Setiap hari" || text === "") return [0, 1, 2, 3, 4, 5, 6];
  for (let i = 0; i < 7; i++) text = text.replaceAll(fullDays[i], days[i]);
  const result = [];
  for (const part of text.split(/\s*(?:,|&)\s*/)) {
    const range = part
      .trim()
      .split("-")
      .map((x) => days.indexOf(x.trim()));
    if (range.some((x) => x < 0) || range.length > 2) return null;
    let d = range[0];
    result.push(d);
    while (range.length === 2 && d !== range[1]) {
      d = (d + 1) % 7;
      result.push(d);
    }
  }
  return result;
}
function minutes(text) {
  const [h, m] = text.split(/[:.]/).map(Number);
  return h >= 0 && h <= 23 && m >= 0 && m < 60 ? h * 60 + m : null;
}
// Unknown formats return null. Never guess opening times.
export function parseHours(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  let text = value.trim().replace(/[–—]/g, "-");
  if (/^Buka 24 jam$/i.test(text))
    return Array.from({ length: 7 }, () => [0, 1440]);
  const exception = text.match(
    / \((Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu) buka (\d{2}[:.]\d{2})\)$/,
  );
  if (exception) text = text.slice(0, exception.index);
  const schedule = Array(7).fill(null);
  for (const part of text.split(";")) {
    const match = part
      .trim()
      .match(/^(.*?)\s*(24 jam|\d{2}[:.]\d{2}-\d{2}[:.]\d{2})$/);
    if (!match) return null;
    const selected = daySet(match[1].trim());
    if (!selected) return null;
    let start = 0,
      end = 1440;
    if (match[2] !== "24 jam") {
      [start, end] = match[2].split("-").map(minutes);
      if (start === null || end === null || start === end) return null;
      if (end < start) end += 1440;
    }
    for (const d of selected) {
      if (schedule[d]) return null;
      schedule[d] = [start, end];
    }
  }
  if (schedule.some((x) => !x)) return null;
  if (exception) {
    const d = fullDays.indexOf(exception[1]);
    const start = minutes(exception[2]);
    if (start === null || start >= schedule[d][1]) return null;
    schedule[d] = [start, schedule[d][1]];
  }
  return schedule;
}
export function isOpen(schedule, date = new Date()) {
  if (!schedule || Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Jakarta",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(
    get("weekday"),
  );
  const time = Number(get("hour")) * 60 + Number(get("minute"));
  const [start, end] = schedule[day];
  const previous = schedule[(day + 6) % 7];
  return (
    (time >= start && time < end) ||
    (previous[1] > 1440 && time < previous[1] - 1440)
  );
}
export function similar(cafe, cafes) {
  const score = (item) =>
    (item.area === cafe.area ? 1 : 0) +
    (item.suasana || []).filter((x) => (cafe.suasana || []).includes(x)).length;
  return cafes
    .filter((x) => x.slug !== cafe.slug)
    .sort((a, b) => score(b) - score(a) || a.slug.localeCompare(b.slug))
    .slice(0, 3);
}
