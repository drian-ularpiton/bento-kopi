import { createServer } from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const dist = path.join(root, "dist");
const option = (name) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const port = Number(option("--port") || process.env.PORT || 8080);
const host = option("--host") || "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain",
  ".woff2": "font/woff2",
  ".webp": "image/webp",
};
function build() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/build.js"], {
      cwd: root,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`Build gagal: ${code}`)),
    );
  });
}
await build();
createServer(async (req, res) => {
  try {
    const uri = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = path.resolve(dist, "." + uri);
    if (!file.startsWith(dist + path.sep) && file !== dist) {
      res.writeHead(403).end();
      return;
    }
    let info = await stat(file);
    if (info.isDirectory()) {
      if (!uri.endsWith("/")) {
        res.writeHead(301, { Location: uri + "/" }).end();
        return;
      }
      file = path.join(file, "index.html");
    }
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      await readFile(path.join(dist, "404.html")).catch(
        () => "Halaman tidak ditemukan.",
      ),
    );
  }
}).listen(port, host, () =>
  console.log(
    `Dev siap di ${host}:${port}. Data/foto/source dipantau; refresh browser setelah build.`,
  ),
);
async function signature(dir) {
  const items = await readdir(dir, { withFileTypes: true });
  const parts = await Promise.all(
    items
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(async (item) => {
        const file = path.join(dir, item.name);
        if (item.isDirectory()) return signature(file);
        const info = await stat(file);
        return `${file}:${info.mtimeMs}:${info.size}`;
      }),
  );
  return parts.join("|");
}
const snapshot = async () =>
  (
    await Promise.all(
      ["data", "public", "src", "scripts"].map((dir) =>
        signature(path.join(root, dir)),
      ),
    )
  ).join("|");
let previous = await snapshot(),
  busy = false;
setInterval(async () => {
  if (busy) return;
  busy = true;
  try {
    const next = await snapshot();
    if (next !== previous) {
      await build();
      previous = next;
    }
  } catch (error) {
    console.error(error.message);
  } finally {
    busy = false;
  }
}, 1500);
