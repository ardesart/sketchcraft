// Release gate for the `publish` job (CASHOUT-001). Run before anything is signed:
//   node tools/release/check-bundles.mjs <bundles-dir> <product> <version>
// <bundles-dir> holds one folder per platform build, downloaded separately:
//   macos/  windows/  linux/  linux-arm64/
// Each folder may contain ONLY that platform's expected file names (nothing else, no folders, no
// links, no duplicates), and each file must be the right kind of file by its first bytes. So one
// platform's build can never supply another platform's update package; Linux programs must also be built
// for that folder's CPU. Writes <bundles-dir>/manifest.json (the update packages that get signed, one per
// folder, and every file to upload).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [dir, product, version] = process.argv.slice(2);
if (!dir || !product || !/^[A-Za-z0-9._-]+$/.test(product) || !/^\d+\.\d+\.\d+$/.test(version || "")) {
  console.error("usage: check-bundles.mjs <dir> <product> <x.y.z>");
  process.exit(2);
}
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const P = esc(product), V = esc(version);
const hex = (b) => b.toString("hex");
const starts = (...sigs) => (buf) => sigs.some((s) => hex(buf.subarray(0, s.length / 2)) === s);
// a 64-bit little-endian ELF program for one CPU (e_machine at byte 18: 0x3e x86-64, 0xb7 AArch64)
const elf = (machine) => (buf) => hex(buf.subarray(0, 6)) === "7f454c460201" && buf.length >= 20 && buf.readUInt16LE(18) === machine;

const PLATFORMS = {
  macos: [
    { key: "update", re: new RegExp(`^${P}(_universal)?\\.app\\.tar\\.gz$`), kind: "macos-app-tarball" },
    { key: "dmg", re: new RegExp(`^${P}_${V}_universal\\.dmg$`), kind: "dmg" },
  ],
  windows: [
    { key: "update", re: new RegExp(`^${P}_${V}_x64-setup\\.exe$`), kind: "pe", magic: starts("4d5a") },
    { key: "msi", re: new RegExp(`^${P}_${V}_x64_en-US\\.msi$`), kind: "msi", magic: starts("d0cf11e0a1b11ae1") },
  ],
  linux: [
    { key: "update", re: new RegExp(`^${P}_${V}_amd64\\.AppImage$`), kind: "elf", magic: elf(0x3e) },
    { key: "deb", re: new RegExp(`^${P}_${V}_amd64\\.deb$`), kind: "deb", magic: starts("213c617263683e0a") },
    { key: "rpm", re: new RegExp(`^${P}-${V}-1\\.x86_64\\.rpm$`), kind: "rpm", magic: starts("edabeedb") },
  ],
  "linux-arm64": [
    { key: "update", re: new RegExp(`^${P}_${V}_aarch64\\.AppImage$`), kind: "elf", magic: elf(0xb7) },
    { key: "deb", re: new RegExp(`^${P}_${V}_arm64\\.deb$`), kind: "deb", magic: starts("213c617263683e0a") },
    { key: "rpm", re: new RegExp(`^${P}-${V}-1\\.aarch64\\.rpm$`), kind: "rpm", magic: starts("edabeedb") },
  ],
};
const MACHO = starts("cafebabe", "feedface", "feedfacf", "cefaedfe", "cffaedfe");

const fail = (m) => { console.error(`::error::${m}`); process.exit(1); };
const head = (f, n = 32) => { const fd = fs.openSync(f, "r"); const b = Buffer.alloc(n); const r = fs.readSync(fd, b, 0, n, 0); fs.closeSync(fd); return b.subarray(0, r); };

function macosTarball(f) {
  if (!starts("1f8b")(head(f))) return "not a gzip file";
  const ls = spawnSync("tar", ["-tzf", f], { encoding: "utf8", maxBuffer: 64 << 20 });
  if (ls.status !== 0) return "tar can't read it";
  const names = ls.stdout.split("\n").filter(Boolean);
  if (names.some((n) => n.startsWith("/") || n.split("/").includes(".."))) return "unsafe path inside";
  const tops = new Set(names.map((n) => n.split("/")[0]));
  if (tops.size !== 1 || ![...tops][0].endsWith(".app")) return "must hold exactly one .app";
  const app = [...tops][0];
  const mac = names.filter((n) => n.startsWith(`${app}/Contents/MacOS/`) && !n.endsWith("/"));
  if (!mac.length) return "no program in Contents/MacOS";
  for (const n of mac) {
    const x = spawnSync("tar", ["-xzOf", f, n], { maxBuffer: 1 << 30 });
    if (x.status !== 0 || !MACHO(x.stdout.subarray(0, 4))) return `${n} is not a Mach-O program`;
  }
  return null;
}
function dmg(f) {
  const size = fs.statSync(f).size;
  if (size < 512) return "too small";
  const fd = fs.openSync(f, "r"); const b = Buffer.alloc(4);
  fs.readSync(fd, b, 0, 4, size - 512); fs.closeSync(fd);
  return b.toString("latin1") === "koly" ? null : "no disk-image trailer";
}

const manifest = { update: {}, upload: [] };
const seenNames = new Set();
const present = fs.readdirSync(dir).filter((n) => n !== "manifest.json");
for (const n of present) if (!PLATFORMS[n]) fail(`unexpected entry ${n} in ${dir}`);
for (const [plat, rules] of Object.entries(PLATFORMS)) {
  const pdir = path.join(dir, plat);
  if (!fs.existsSync(pdir)) fail(`the ${plat} build is missing`);
  const names = fs.readdirSync(pdir);
  const used = new Set();
  for (const n of names) {
    const rule = rules.find((r) => r.re.test(n));
    if (!rule) fail(`${plat}: file ${JSON.stringify(n)} isn't one of the names this platform builds`);
    if (used.has(rule.key)) fail(`${plat}: two files for ${rule.key}`);
    used.add(rule.key);
    if (seenNames.has(n)) fail(`${n} comes from two platforms`);
    seenNames.add(n);
    const f = path.join(pdir, n);
    const st = fs.lstatSync(f);
    if (!st.isFile() || st.isSymbolicLink() || st.size === 0) fail(`${plat}/${n} is not a plain, non-empty file`);
    const bad = rule.kind === "macos-app-tarball" ? macosTarball(f) : rule.kind === "dmg" ? dmg(f) : rule.magic(head(f)) ? null : "wrong file type";
    if (bad) fail(`${plat}/${n}: ${bad}`);
    manifest.upload.push(`${plat}/${n}`);
    if (rule.key === "update") manifest.update[plat] = `${plat}/${n}`;
  }
  for (const r of rules) if (!used.has(r.key)) fail(`${plat}: missing ${r.key} (${r.re})`);
}
fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log(`bundles ok: ${manifest.upload.length} files`);
