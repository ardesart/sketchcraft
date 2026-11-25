// Signed self-updates. A few seconds after launch (and every six hours) the
// desktop app reads latest-v2.json from the newest GitHub release (older installs read latest.json: docs/SIGNING.md, "Key rotation"); Tauri checks
// each download against the public key in tauri.conf.json before installing.
// When an install can't be done in place (a .deb or .rpm, a failed download),
// the card offers the download page instead.
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { inTauri, onMobileApp } from "./engine";

const FIRST_CHECK_MS = 8_000;
const EVERY_MS = 6 * 60 * 60 * 1000;
const SNOOZE_KEY = "sketchcraft.update.snoozed";
const EVENT = "sketchcraft:check-updates";

/** Ask for a check now (File menu, command palette); the card shows the answer. */
export function checkForUpdatesNow() {
  window.dispatchEvent(new Event(EVENT));
}

type Card =
  | { kind: "ready"; update: Update }
  | { kind: "working"; title: string; percent: number | null }
  | { kind: "failed"; version: string; why: string }
  | { kind: "note"; text: string };

const snoozed = (v: string) => {
  try {
    return localStorage.getItem(SNOOZE_KEY) === v;
  } catch {
    return false;
  }
};

export function UpdateCard() {
  const [card, setCard] = useState<Card | null>(null);
  const [notes, setNotes] = useState(false);
  const busy = useRef(false);
  // the portable ZIP updates by downloading the new ZIP, not by installing
  const portable = useRef(false);
  useEffect(() => {
    if (inTauri) invoke<boolean>("portable").then((p) => (portable.current = p), () => {});
  }, []);

  const look = async (manual: boolean) => {
    if (!inTauri || busy.current) return;
    // the Android app doesn't update itself: a new APK (or a store update) replaces it
    if (onMobileApp) {
      if (manual) setCard({ kind: "note", text: `This is SketchCraft ${await getVersion()} for Android. New versions come as a new APK on the releases page.` });
      return;
    }
    if (manual) setCard({ kind: "note", text: "Checking for updates…" });
    try {
      const u = await check();
      if (!u) {
        if (manual) setCard({ kind: "note", text: `You're on the latest version (${await getVersion()}).` });
        return;
      }
      if (manual || !snoozed(u.version)) setCard({ kind: "ready", update: u });
    } catch (e) {
      // offline and the like: quiet unless asked
      if (manual) setCard({ kind: "note", text: `Couldn't check for updates: ${String(e)}` });
    }
  };

  useEffect(() => {
    if (!inTauri || onMobileApp) return;
    const first = window.setTimeout(() => void look(false), FIRST_CHECK_MS);
    const every = window.setInterval(() => void look(false), EVERY_MS);
    const onAsk = () => void look(true);
    window.addEventListener(EVENT, onAsk);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
      window.removeEventListener(EVENT, onAsk);
    };
  }, []);

  const install = async (u: Update) => {
    if (busy.current) return;
    busy.current = true;
    let total = 0;
    let got = 0;
    setCard({ kind: "working", title: `Downloading SketchCraft ${u.version}…`, percent: null });
    try {
      await u.downloadAndInstall((ev) => {
        if (ev.event === "Started") total = ev.data.contentLength ?? 0;
        if (ev.event === "Progress") {
          got += ev.data.chunkLength;
          setCard({ kind: "working", title: `Downloading SketchCraft ${u.version}…`, percent: total ? Math.min(100, Math.round((got / total) * 100)) : null });
        }
        if (ev.event === "Finished") setCard({ kind: "working", title: "Installing. SketchCraft will restart.", percent: 100 });
      });
      await relaunch();
    } catch (e) {
      busy.current = false;
      setCard({ kind: "failed", version: u.version, why: String(e) });
    }
  };

  if (!card) return null;
  const close = () => {
    if (card.kind === "ready") {
      try {
        localStorage.setItem(SNOOZE_KEY, card.update.version);
      } catch {}
    }
    setNotes(false);
    setCard(null);
  };
  return (
    <div className="update-card" role="status" aria-live="polite">
      {card.kind === "ready" && (
        <>
          <b>SketchCraft {card.update.version} is ready</b>
          <p>{portable.current ? "This is the portable copy: unzip the new version over this folder. Your models aren't touched." : "Your model is saved as you work, so it's safe to update now. Takes about a minute."}</p>
          {notes && card.update.body && <pre className="update-notes">{card.update.body}</pre>}
          <div className="row gap">
            {portable.current ? (
              <button className="btn small primary" onClick={() => void invoke("open_releases")} title="This is the portable copy: download the new ZIP and unzip it over this folder">
                Download the new ZIP
              </button>
            ) : (
              <button className="btn small primary" onClick={() => void install(card.update)}>
                Update and restart
              </button>
            )}
            {card.update.body && (
              <button className="btn small ghost" onClick={() => setNotes((n) => !n)}>
                {notes ? "Hide" : "What's new"}
              </button>
            )}
            <button className="btn small ghost" onClick={close}>
              Not now
            </button>
          </div>
        </>
      )}
      {card.kind === "working" && (
        <>
          <b>{card.title}</b>
          <div className="update-bar">
            <i style={{ width: `${card.percent ?? 8}%` }} />
          </div>
        </>
      )}
      {card.kind === "failed" && (
        <>
          <b>SketchCraft {card.version} couldn't install itself</b>
          <p>This copy can't update in place ({card.why}). Download the new version and install it over this one; your models aren't touched.</p>
          <div className="row gap">
            <button className="btn small primary" onClick={() => void invoke("open_releases")}>
              Open the download page
            </button>
            <button className="btn small ghost" onClick={close}>
              Close
            </button>
          </div>
        </>
      )}
      {card.kind === "note" && (
        <>
          <p>{card.text}</p>
          <div className="row gap">
            <button className="btn small ghost" onClick={close}>
              OK
            </button>
          </div>
        </>
      )}
    </div>
  );
}
