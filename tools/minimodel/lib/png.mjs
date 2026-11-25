// A tiny valid PNG as a data: URL (solid colour or checker), for fixtures that need a picture material.
import { deflateSync, crc32 } from "node:zlib";
const chunk = (type, data) => { const t = Buffer.from(type), len = Buffer.alloc(4); len.writeUInt32BE(data.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])) >>> 0); return Buffer.concat([len, t, data, crc]); };
export function pngUrl(rgb = [200, 80, 40], n = 4) {
  const rows = [];
  for (let y = 0; y < n; y++) { const row = [0]; for (let x = 0; x < n; x++) { const k = (x + y) % 2 ? 0.75 : 1; row.push(...rgb.map((v) => Math.round(v * k)), 255); } rows.push(Buffer.from(row)); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
  return "data:image/png;base64," + png.toString("base64");
}
