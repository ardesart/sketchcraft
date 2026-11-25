# Signing the releases

## Where it stands

| Platform | Today | What people see |
| --- | --- | --- |
| macOS | ad-hoc signed (whole app, hardened runtime); not notarized | "Apple could not verify SketchCraft": **System Settings › Privacy & Security › Open Anyway** |
| Windows | unsigned | SmartScreen: **More info › Run anyway** |
| Linux | no signing needed | nothing |

## macOS: Developer ID and notarization

The release workflow signs and notarizes automatically once these
secrets exist in the `release` Environment and the `APPLE_SIGNING` variable is `true`.
Without them it builds exactly as today.

1. Join the Apple Developer Program (99 USD a year) at developer.apple.com.
2. In Xcode or the developer site, create a **Developer ID Application**
   certificate and export it from Keychain Access as a `.p12` with a password.
3. Add the secrets to the **`release` Environment** (Settings › Environments › release › Environment secrets; not
   repository secrets: only a job that names the environment, after its reviewer approves, can read them):

| Secret | Value |
| --- | --- |
| `APPLE_CERTIFICATE` | the `.p12`, base64: `base64 -i cert.p12 \| pbcopy` |
| `APPLE_CERTIFICATE_PASSWORD` | the `.p12`'s password |
| `APPLE_SIGNING_IDENTITY` | e.g. `Developer ID Application: Your Name (TEAMID)` (`security find-identity -v -p codesigning`) |
| `APPLE_ID` | your Apple ID email |
| `APPLE_PASSWORD` | an **app-specific password** from appleid.apple.com (not your Apple ID password) |
| `APPLE_TEAM_ID` | the 10-character team id |

4. Switch it on with a repository **variable** (not a secret): Settings › Secrets and variables › Actions › Variables
   › `APPLE_SIGNING` = `true`. Without it the workflow builds unsigned, as today.
5. Push a new tag. The `release` reviewer is asked twice (`sign-macos`, then `publish`). The DMG and app are then signed with your Developer ID
   and notarized, and open with no warning.

## App updates

The desktop app updates itself from GitHub Releases: it reads `latest-v2.json`
from the newest release (installs before 0.3.6 read `latest.json`; see "Key rotation" below),
downloads the update for its platform, and installs
it only if it was signed with SketchCraft's update key. The public half is in
`app/src-tauri/tauri.conf.json`; the private half is
`~/.tauri/sketchcraft-updater-v2.key` on the maintainer's Mac (it has a password; the older
`~/.tauri/sketchcraft-updater.key` has none and signs only v0.3.6).

The release workflow needs that private key as a repository secret, or the
build fails:

```sh
gh secret set TAURI_SIGNING_PRIVATE_KEY -R jasonsutter87/sketchcraft < ~/.tauri/sketchcraft-updater-v2.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R jasonsutter87/sketchcraft
```

(Only after v0.3.6 ships; v0.3.6 itself is signed with the old key. See "Key rotation".)

**Back the key up** (a password manager is fine). If it's lost, installed
copies can't verify anything newer, and everyone has to download one new
version by hand. Never commit it.

Every installer type updates itself (macOS app, Windows `.msi` and setup
`.exe`, Linux `.AppImage`, `.deb` and `.rpm`; Linux packages ask for an admin
password). If an install fails, the card offers the download page instead.

## Checking a download

Every release lists `SHA256SUMS.txt` with the SHA-256 of each file on it. After
downloading: `shasum -a 256 SketchCraft_*.dmg` (macOS/Linux) or
`Get-FileHash SketchCraft_*_x64-setup.exe` (Windows) and compare. Only download
from this repository's Releases page.

Every installer, update package and zip is also **attested**: the release workflow records,
through GitHub and Sigstore, that the file came out of this repository's workflow at that tag
and commit. This is stronger than the checksum list, which is published beside the files
and so proves only that a file matches the list. To check one (needs the GitHub CLI, `gh`):

```sh
gh attestation verify SketchCraft_0.3.6_universal.dmg --repo jasonsutter87/sketchcraft
```

It prints the workflow, tag and commit, or fails if the file isn't one the workflow made.
(The update packages are checked by the app itself against the update key.)

## Protecting the release

What the workflow does for you: releases build only from a `v*` tag on a commit
that's on `main` and matches the app's version, after CI passes; actions are
pinned to commit SHAs; npm install scripts don't run; and compiling is kept apart from
signing. The `build` job compiles with `--locked`, holds no update key and only a
read-only token (so no dependency's build script or proc-macro can read the key);
it signs its update packages with a throwaway key made for that run. The `publish`
job, which compiles nothing, first checks that each platform's download holds only that platform's own file names and file types (so one platform's build can't hand another platform's update package to the signer), then signs them for real with the key from the `release`
environment and creates the draft release. The Apple secrets (once added, as `release` Environment secrets) go only to
steps of the `sign-macos` job, which names that environment, compiles nothing and checks out no code: it
takes the unsigned macOS app the `build` job made (built with no secrets, like every
platform), signs and notarizes it with Apple's own tools, and hands it to `publish`.
That job has never run, so watch the first tag after adding the Apple secrets (it
rebuilds the disk image with `hdiutil`, so the dmg's window layout is plain).

What only the repository owner can switch on (GitHub settings):

1. **Settings › Environments › New environment `release`**: add yourself under
   *Required reviewers* and move `TAURI_SIGNING_PRIVATE_KEY` and
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` from repository secrets into that
   environment. The `publish` job is the only one that names it, so a release
   waits for your approval before the key is available. The `APPLE_*` secrets go
   into the same environment, and `sign-macos` names it too (see "macOS: Developer ID and notarization" above).
   Until you do this, a tag push signs and drafts a release unattended.
2. **Settings › Rules › Rulesets › New tag ruleset**: target `v*`, restrict
   creation and deletion to yourself (no bypass), so a collaborator's tag can't
   start a release.
3. Turn on two-factor authentication (a passkey) for the account, and
   *Settings › General › Releases › Enable release immutability* so published
   releases can't be edited.

The updater key: the old key had no password, so anything that could read the file could sign an
update; the v2 key has one. The public half is built into every installed copy, so changing keys
without a bridge would strand everyone already installed. The 0.3.6 bridge below avoids that. Keep
both private keys out of backups you don't control and off shared machines. The app already refuses
updates that aren't newer than the installed version or whose download isn't under that version's own
release address.

## Windows

Options, cheapest first:

- **SignPath Foundation**: free code signing for open-source projects
  (apply at signpath.org; they sign builds from CI).
- **Azure Trusted Signing**: about 10 USD a month; needs identity
  validation. Tauri can call it through `bundle.windows.signCommand`.
- An OV or EV certificate from a certificate authority.

Each needs its own small workflow change; tell Claude which you pick.

The release workflow could not be run while it was changed (it needs GitHub). On the
first tag, watch the `build` and `publish` jobs: `publish` expects one `.app.tar.gz`,
one `-setup.exe` and one `.AppImage` per Linux CPU (x64 and arm64) among the built files, signs each with
`tauri signer sign` and writes `latest.json` itself. If a step fails, the draft
isn't created and nothing is published.

## Key rotation (0.3.6 bridge)

Installed apps 0.3.3 to 0.3.5 trust only the OLD update public key and read `latest.json`. Apps from
0.3.6 on trust the NEW key (minisign ID `7FA39E3CF8D0701C`) and read `latest-v2.json`.
Nobody has to download anything by hand.

| Release | Signed with | `latest-v2.json` (new installs read this) | `latest.json` (old installs read this) |
| --- | --- | --- | --- |
| v0.3.6 (the bridge) | OLD key (the secret as it is today) | v0.3.6 | the same file, byte for byte |
| every later release | NEW key | that release | a frozen copy of v0.3.6's manifest: `tools/release/bridge-latest.json` |

An install still on 0.3.5 or older (even one that skipped 0.3.6) is sent to 0.3.6 first, which brings
the new public key and the new address; from then on it follows `latest-v2.json`.

How the release workflow decides: the `guard` job runs `tools/release/preflight.mjs`, which reads
the app version. Exactly `0.3.6` takes the **bridge** path; anything greater takes the **post-bridge**
path; anything lower is refused. Then, in `publish`:

- `tools/release/key-check.mjs` signs a throwaway file with the secret and verifies it with a minisign check
  against the key this version needs (OLD for 0.3.6; the `pubkey` in `tauri.conf.json` for later ones).
  If the secret was not swapped, the release fails here instead of shipping updates nobody can install.
- `tools/release/make-manifests.mjs` verifies every signature against that same public key, then writes both files.
  It refuses if the tag isn't `v<app version>`, if `tauri.conf.json` still has the old public key or the wrong
  endpoint, if a later release has no bridge file, if the bridge file isn't version 0.3.6, if any of its URLs isn't an
  asset of the `v0.3.6` release, or if its signatures aren't from the OLD key. It can never write a new-key
  `latest.json` at the old path.

### Rehearsal results

Run with throwaway keys (`tools/key-rotation-harness/rehearse.sh <scratch folder>`): real `tauri signer`
signatures, the real release scripts on fake bundles, a local server standing in for GitHub, and a client
(`tools/key-rotation-harness`) that repeats tauri-plugin-updater 2.14.1's own checks with the same
`minisign-verify` 0.3.0 and the app's own newer-version and release-address rule. Nothing used the real keys.

| Path | Result |
| --- | --- |
| a. 0.3.5 client (OLD key, `latest.json`) sees 0.3.6, verifies, accepts | pass |
| b. 0.3.6 client (NEW key, `latest-v2.json`) sees 0.3.7 signed with NEW, accepts | pass |
| c. 0.3.4 client, 0.3.6 skipped, 0.3.7 out: gets the bridge to 0.3.6, accepts; next poll gets 0.3.7 | pass |
| d1. 0.3.5 client offered a NEW-signed 0.3.7 rejects it | pass |
| d2. 0.3.6 client offered an OLD-signed fake 0.3.7 rejects it | pass |
| d3. tampered bundle rejected | pass |
| d4. downgrade (0.3.7 client offered 0.3.6) refused | pass |
| e. manifest scripts: bridge and post-bridge output; no bridge file, bridge of the wrong version, bridge URLs at another release, a NEW-key "bridge", un-swapped secret, bridge release signed with the NEW key, old pubkey left in the config, tag mismatch, version below the bridge, bundles signed by the wrong key, bundle changed after signing all refuse | pass (12 of 12) |

Not rehearsed: the GitHub Actions run itself, GitHub's `releases/latest/download` redirect, the real
installers' install step, and the real keys (the workflow's first real run is v0.3.6).

### Your steps

Before tagging v0.3.6 (no secret change; the secret stays the OLD key):

1. Bump the app version to `0.3.6` (`app/src-tauri/tauri.conf.json`, `app/package.json`, the Cargo.toml versions and `Cargo.lock`) and merge to `main`.
2. Tag `v0.3.6`, review the draft, and publish it. Check that the release has `latest.json` and `latest-v2.json`.

After v0.3.6 ships, in this order:

```sh
# 1. the new signing key, then its password (this prompts for the value)
gh secret set TAURI_SIGNING_PRIVATE_KEY -R jasonsutter87/sketchcraft < ~/.tauri/sketchcraft-updater-v2.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD -R jasonsutter87/sketchcraft

# 2. freeze v0.3.6's manifest and commit it
gh release download v0.3.6 -R jasonsutter87/sketchcraft -p latest.json -D /tmp/bridge
node tools/release/freeze-bridge.mjs /tmp/bridge/latest.json
git add tools/release/bridge-latest.json
git commit -m "Freeze the v0.3.6 update manifest for the key bridge"
git push
```

If the secrets live in the `release` Environment, set them there instead (`gh secret set --env release ...`).
Do this before the next tag: a release after 0.3.6 with no bridge file, or with the old key still in the secret, fails on purpose.

**Never delete the v0.3.6 release** (or its files). Every later `latest.json` points at its assets; delete it
and every install still on 0.3.5 or older is stranded. Turning on release immutability protects it.

