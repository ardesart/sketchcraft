// The bar over the 3D view while the parts are laid out flat (View > Lay out parts): how many, what was left out,
// the part just clicked, and the way back. The engine refuses changes until then (core/src/parts_layout.rs).
import type { LaidOut } from "./engine";
import { useLocale } from "./locale";
import { formatLength } from "./units";

/** The part ids while the parts are laid out; null when the model is shown as it is. */
export function laidOutParts(laid: LaidOut | null | undefined): Set<number> | null {
  return laid ? new Set(laid.parts.map((p) => p.id)) : null;
}

/** Laid out, a click takes the part it landed on: the innermost group in `chain` (innermost first) that is a part,
 *  never the group around it, which is not drawn where its parts lie. Null: no part in the chain. */
export function innermostPart(chain: number[], parts: Set<number>): number | null {
  return chain.find((g) => parts.has(g)) ?? null;
}

/** "Side: 900 × 400 × 18 mm" for the clicked part, in the model's units */
export function partLabel(laid: LaidOut, ids: number[], units: string): string | null {
  const p = laid.parts.find((q) => ids.includes(q.id));
  return p ? `${p.name}: ${p.size.map((x) => formatLength(x, units)).join(" × ")}` : null;
}

export function LaidOutBar({ laid, selected, units, onBack }: { laid: LaidOut; selected: number[]; units: string; onBack: () => void }) {
  const { t } = useLocale();
  const part = partLabel(laid, selected, units);
  return (
    <div className="laidout-bar" role="status" data-testid="laid-out-notice">
      <span>{t("laidOut.bar").replace("{n}", String(laid.parts.length))}</span>
      {laid.loose_faces > 0 && <span className="muted">{t("laidOut.loose").replace("{n}", String(laid.loose_faces))}</span>}
      {part && <b>{part}</b>}
      <button className="btn small" onClick={onBack}>
        {t("laidOut.back")}
      </button>
    </div>
  );
}
