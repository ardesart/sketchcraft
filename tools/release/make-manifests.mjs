// publish job, after the update packages are signed:
//   node tools/release/make-manifests.mjs <repo-root> <bundles-dir>
// Writes <bundles-dir>/latest-v2.json and <bundles-dir>/latest.json. Env: GITHUB_REF_NAME (tag), GITHUB_REPOSITORY.
//   v0.3.6 (bridge): both files are the same manifest, signed with the OLD key.
//   later (post):    latest-v2.json is this release's own manifest, signed with the NEW key;
//                    latest.json is a byte copy of the frozen 0.3.6 manifest (tools/release/bridge-latest.json).
// Fails closed (nothing written) on: tag/version mismatch, no or bad bridge file, signatures from the wrong key.
import fs from "node:fs";
import path from "node:path";
import { BRIDGE_FILE, BRIDGE_VERSION, Refusal, readConfig, readJson, refuse, validateBridge, verifyData, keyIdOfPubkey, keyIdOfSignature } from "./bridge.mjs";

const [root, dir] = process.argv.slice(2);
const repo = process.env.GITHUB_REPOSITORY || "jasonsutter87/sketchcraft";
const tag = process.env.GITHUB_REF_NAME;
try {
  const { version: v, mode, pub, old } = readConfig(root, repo);
  if (tag !== `v${v}`) refuse(`tag ${tag} is not v${v}`);
  const signedBy = mode === "bridge" ? old : pub;
  const base = `https://github.com/${repo}/releases/download/${tag}/`;
  const upd = readJson(path.join(dir, "manifest.json")).update;
  const entry = (rel) => {
    const sig = fs.readFileSync(path.join(dir, `${rel}.sig`), "utf8").trim();
    const signedVersion = verifyData(signedBy, fs.readFileSync(path.join(dir, rel)), sig);
    if (signedVersion !== null && signedVersion !== v) refuse(`${rel} was signed for version ${signedVersion}, not ${v}`);
    return { signature: sig, url: base + encodeURIComponent(rel.split("/").pop()) };
  };
  const mac = entry(upd.macos);
  const platforms = {
    "darwin-aarch64": mac, "darwin-x86_64": mac, "windows-x86_64": entry(upd.windows),
    "linux-x86_64": entry(upd.linux), "linux-aarch64": entry(upd["linux-arm64"]),
  };
  const own = JSON.stringify({ version: v, notes: `SketchCraft ${v}`, pub_date: new Date().toISOString(), platforms }, null, 2);

  let legacy; // what ≤0.3.5 apps read at the old path
  if (mode === "bridge") {
    legacy = own;
  } else {
    const bf = path.join(root, BRIDGE_FILE);
    if (!fs.existsSync(bf)) refuse(`${BRIDGE_FILE} is missing: freeze v${BRIDGE_VERSION}'s latest.json first (docs/SIGNING.md)`);
    legacy = fs.readFileSync(bf, "utf8");
    let parsed; try { parsed = JSON.parse(legacy); } catch { refuse(`${BRIDGE_FILE} is not valid JSON`); }
    validateBridge(parsed, repo, old);
  }
  // last look at what will be published, whichever path made it
  const v2 = JSON.parse(own), lg = JSON.parse(legacy);
  const wantLegacy = mode === "bridge" ? v : BRIDGE_VERSION;
  if (lg.version !== wantLegacy) refuse(`latest.json would announce ${lg.version}; it must announce ${wantLegacy}`);
  for (const e of Object.values(lg.platforms)) if (keyIdOfSignature(e.signature) !== keyIdOfPubkey(old)) refuse("latest.json would carry a signature that isn't from the OLD key");
  for (const e of Object.values(v2.platforms)) if (keyIdOfSignature(e.signature) !== keyIdOfPubkey(signedBy)) refuse("latest-v2.json has a signature from the wrong key");
  fs.writeFileSync(path.join(dir, "latest-v2.json"), own);
  fs.writeFileSync(path.join(dir, "latest.json"), legacy);
  console.log(`manifests ok (${mode}): latest-v2.json announces ${v}, latest.json announces ${lg.version}`);
} catch (e) {
  if (!(e instanceof Refusal)) throw e;
  console.error(`::error::${e.message}`);
  process.exit(1);
}
