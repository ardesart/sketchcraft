// Environments (a sky and a place for the model) and the starter templates.
import { type Scene } from "./engine";
import { Icons } from "./icons";
import { EXAMPLES, TEMPLATES } from "./templates";
import { type Run } from "./panelkit";

/** Ready-made settings to put a model in. */
export const ENVIRONMENTS: { id: string; name: string; about: string; look: string }[] = [
  { id: "suburban", name: "Suburban lot", about: "Lawn, fence, sidewalk, street, trees", look: "linear-gradient(180deg,#bcd6f0 0 38%,#5d8d42 38% 80%,#2b2b2d 80%)" },
  { id: "city", name: "City block", about: "Street, sidewalks, neighbours, cars", look: "linear-gradient(90deg,#8a4b3d 0 22%,#c9b99c 22% 40%,#bcd6f0 40% 60%,#6e6e70 60% 78%,#4a3430 78%)" },
  { id: "park", name: "Park", about: "Lawn, paths, a pond, trees, benches", look: "radial-gradient(circle at 70% 35%,#3b6b86 0 16%,transparent 17%),linear-gradient(180deg,#bcd6f0 0 30%,#629546 30%)" },
  { id: "desert", name: "Desert", about: "Sand, rocks, cacti, palms", look: "linear-gradient(180deg,#f2d4a8 0 40%,#dbb682 40%)" },
  { id: "waterfront", name: "Waterfront", about: "Boardwalk, beach, a pier, water", look: "linear-gradient(180deg,#bcd6f0 0 35%,#2a5d7a 35% 62%,#e3d2a8 62% 78%,#8c6644 78%)" },
  { id: "studio", name: "Studio", about: "Seamless backdrop and softboxes, for objects", look: "radial-gradient(ellipse at 50% 85%,#ffffff 0 30%,#d9d8d4 60%,#3a3a3a 100%)" },
];

export function Environments({ scene, run, onToast }: { scene: Scene; run: Run; onToast: (t: string, bad?: boolean) => void }) {
  const current = scene.environment ?? null;
  const put = async (id: string) => {
    const r = await run({ cmd: "environment", kind: id });
    if (r.ok) onToast(id === "none" ? "Environment removed" : `${ENVIRONMENTS.find((e) => e.id === id)?.name}: it's in the Outliner as a locked group (tag "Environment"). ⌘Z takes it back.`);
  };
  return (
    <div className="envs">
      <p className="muted small">A setting around your model, sized to it. Swap any time; it stays one locked group you can hide.</p>
      <div className="env-grid">
        {ENVIRONMENTS.map((e) => (
          <button key={e.id} className={`env-tile ${current === e.id ? "on" : ""}`} onClick={() => put(e.id)} title={e.about} aria-pressed={current === e.id}>
            <span className="env-art" style={{ background: e.look }} />
            <b>{e.name}</b>
            <span className="small">{e.about}</span>
          </button>
        ))}
      </div>
      {current && (
        <button className="btn small ghost" onClick={() => put("none")}>
          Remove the environment
        </button>
      )}
    </div>
  );
}

/** Finished example models: one click opens one (after asking, when there's a model open). */
export function Examples({ onExample }: { onExample: (name: string, data: string) => void }) {
  return (
    <div className="tiles">
      {EXAMPLES.map((x) => (
        <button key={x.name} className="tile" onClick={() => onExample(x.name, x.data)} title={x.about} data-testid={`example-${x.name.toLowerCase()}`}>
          <span className="tile-art thumb-art">
            <img className="thumb" src={x.thumb} alt="" />
          </span>
          <span>{x.name}</span>
        </button>
      ))}
    </div>
  );
}

export function Templates({ onTemplate }: { onTemplate: (lines: string[]) => void }) {
  return <TemplateTiles onTemplate={onTemplate} />;
}

function TemplateTiles({ onTemplate }: { onTemplate: (lines: string[]) => void }) {
  return (
    <div className="tiles">
      {TEMPLATES.map((t) => (
        <button key={t.name} className="tile" onClick={() => onTemplate(t.lines)} title={t.about}>
          <span className="tile-art" style={{ background: t.tint }}>
            <Icons.cube />
          </span>
          <span>{t.name}</span>
        </button>
      ))}
    </div>
  );
}
