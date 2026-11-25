// Result checks: assert on what the engine says the model IS after the commands
// ran (info / parts / faces JSON), never on the command text. Any correct command
// sequence passes. A check is plain JSON (see eval/README in ../README.md):
//
//   bbox:      {size:[x,y,z], min:[..], max:[..], tol, xy_any, xy_has}   null entries are skipped
//   groups:    {n | min | max, name:"regex"}          (counts groups, optionally by name)
//   instances: {n | min | max, name:"regex"}          (components placed)
//   faces:     {min, max}                             total face count
//   parts:     [{name?:"regex", size:[a,b,c], tol}]   each entry must match a part (sizes compared sorted, big to small)
//   has_face:  [{normal:[..], normal_abs?, area?, z?:[lo,hi], tol?, min?, group?:"regex"}]
//   painted:   [{color:"red", where:{group?:"regex", normal?:[..], z?:[lo,hi]}, all?:true, min?:n, none?:true}]
//   material:  [{name:"brick", where:{group?,normal?,z?..}, all?:true, min?:n, none?:true}]   faces wearing that named material
//   tags:      ["name"]
//   reply:     [{key:"volume", approx:28.8, tol?}]   a number some command replied with
//   plan:      {floors:[{rooms:[[name, m2], ..], openings:{door:n, window:n, opening:n, open:n}}], tol?}   checked against
//              the floorplan_build reply: per floor, the room count, each room by name (case/punctuation-blind, either
//              name may contain the other) with its centerline area within tol (default 4% or 0.2 m2), and the
//              number of openings of each kind
const lerr = (a, b, tol) => Math.abs(a - b) <= tol;

export function colorClass(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (mx < 0.18) return "black";
  if (d < 0.12) return mx > 0.85 ? "white" : "gray";
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  const s = d / mx;
  if (h < 15 || h >= 345) return mx < 0.5 ? "brown" : "red";
  if (h < 40) return mx < 0.65 ? "brown" : "orange";
  if (h < 70) return "yellow";
  if (h < 170) return "green";
  if (h < 255) return "blue";
  if (h < 300) return "purple";
  if (h < 345) return s > 0.3 ? "pink" : "red";
  return null;
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function faceMatches(f, w, groupName) {
  if (w.normal) {
    const d = dot(f.normal, w.normal);
    if (w.normal_abs ? Math.abs(d) < 0.95 : d < 0.95) return false;
  }
  if (w.x && !(f.center[0] >= w.x[0] && f.center[0] <= w.x[1])) return false;
  if (w.y && !(f.center[1] >= w.y[0] && f.center[1] <= w.y[1])) return false;
  if (w.z && !(f.center[2] >= w.z[0] && f.center[2] <= w.z[1])) return false;
  if (w.group != null) {
    if (f.group == null || !new RegExp(w.group, "i").test(groupName(f.group))) return false;
  }
  return true;
}

export function grade(check, state, replies, replyScope = []) {
  const { info, parts, faces } = state;
  const errs = [];
  const groups = info.groups || [];
  const insts = info.instances || [];
  const gname = (id) => (groups.find((g) => g.id === id) || {}).name || "";
  const count = (spec, items, nameOf, label) => {
    const n = spec.name ? items.filter((x) => new RegExp(spec.name, "i").test(nameOf(x))).length : items.length;
    if (spec.n != null && n !== spec.n) errs.push(`${label}${spec.name ? ` /${spec.name}/` : ""}: ${n}, want ${spec.n}`);
    if (spec.min != null && n < spec.min) errs.push(`${label}${spec.name ? ` /${spec.name}/` : ""}: ${n}, want >= ${spec.min}`);
    if (spec.max != null && n > spec.max) errs.push(`${label}${spec.name ? ` /${spec.name}/` : ""}: ${n}, want <= ${spec.max}`);
  };
  if (check.bbox) {
    const b = info.bounds;
    const tol = check.bbox.tol ?? 0.05;
    if (!b) errs.push("empty model (no bounds)");
    else {
      const size = [0, 1, 2].map((i) => b.max[i] - b.min[i]);
      const want = check.bbox.size;
      if (want) {
        let sz = size, w = want;
        if (check.bbox.xy_any) {
          // the two horizontal sides may come either way round
          const a = want[0], c = want[1];
          const ok = lerr(size[2], want[2] ?? size[2], tol) && ((lerr(size[0], a, tol) && lerr(size[1], c, tol)) || (lerr(size[0], c, tol) && lerr(size[1], a, tol)));
          if (!ok) errs.push(`bbox size ${size.map((v) => +v.toFixed(3))}, want ${want} (x/y either way)`);
        } else {
          w.forEach((v, i) => { if (v != null && !lerr(sz[i], v, tol)) errs.push(`bbox size[${"xyz"[i]}] ${sz[i].toFixed(3)}, want ${v}`); });
        }
      }
      if (check.bbox.xy_has != null && !(lerr(size[0], check.bbox.xy_has, tol) || lerr(size[1], check.bbox.xy_has, tol))) errs.push(`bbox x/y ${size[0].toFixed(2)},${size[1].toFixed(2)} has no side ${check.bbox.xy_has}`);
      for (const k of ["min", "max"]) (check.bbox[k] || []).forEach((v, i) => { if (v != null && !lerr(b[k][i], v, tol)) errs.push(`bbox ${k}[${"xyz"[i]}] ${b[k][i].toFixed(3)}, want ${v}`); });
    }
  }
  if (check.groups) count(check.groups, groups, (g) => g.name, "groups");
  if (check.instances) count(check.instances, insts, (g) => g.name, "instances");
  if (check.faces) {
    const n = (info.faces ?? faces.length);
    if (check.faces.min != null && n < check.faces.min) errs.push(`faces ${n}, want >= ${check.faces.min}`);
    if (check.faces.max != null && n > check.faces.max) errs.push(`faces ${n}, want <= ${check.faces.max}`);
  }
  for (const p of check.parts || []) {
    const tol = p.tol ?? 0.05;
    const want = [...p.size].sort((a, b) => b - a);
    const ok = parts.some((q) => (!p.name || new RegExp(p.name, "i").test(q.name)) && [...q.size].sort((a, b) => b - a).every((v, i) => want[i] == null || lerr(v, want[i], tol)));
    if (!ok) errs.push(`no part${p.name ? ` /${p.name}/` : ""} of size ${p.size} (have ${parts.map((q) => q.name + ":" + q.size.map((v) => +v.toFixed(2))).join(" ")})`);
  }
  for (const h of check.has_face || []) {
    const tol = h.tol ?? 0.05;
    const n = faces.filter((f) => faceMatches(f, h, gname) && (h.area == null || lerr(f.area, h.area, Math.max(tol, h.area * 0.02)))).length;
    if (n < (h.min ?? 1)) errs.push(`no face matching ${JSON.stringify(h)}`);
  }
  for (const pc of check.painted || []) {
    const sel = faces.filter((f) => faceMatches(f, pc.where || {}, gname));
    const hit = sel.filter((f) => colorClass(f.material) === pc.color);
    if (pc.none) { if (hit.length) errs.push(`${hit.length} faces are ${pc.color}, want none ${JSON.stringify(pc.where)}`); }
    else {
      if (!sel.length) errs.push(`no faces to paint ${JSON.stringify(pc.where)}`);
      else if (pc.all && hit.length !== sel.length) errs.push(`${hit.length}/${sel.length} faces ${pc.color} ${JSON.stringify(pc.where)} (materials ${[...new Set(sel.map((f) => f.material))]})`);
      else if (hit.length < (pc.min ?? 1)) errs.push(`${hit.length} faces ${pc.color}, want >= ${pc.min ?? 1} ${JSON.stringify(pc.where)}`);
    }
  }
  for (const mc of check.material || []) {
    const sel = faces.filter((f) => faceMatches(f, mc.where || {}, gname));
    const hit = sel.filter((f) => f.material === mc.name);
    if (mc.none) { if (hit.length) errs.push(`${hit.length} faces wear ${mc.name}, want none ${JSON.stringify(mc.where || {})}`); }
    else if (!sel.length) errs.push(`no faces for material ${mc.name} ${JSON.stringify(mc.where || {})}`);
    else if (mc.all && hit.length !== sel.length) errs.push(`${hit.length}/${sel.length} faces wear ${mc.name} ${JSON.stringify(mc.where || {})} (have ${[...new Set(sel.map((f) => f.material))]})`);
    else if (hit.length < (mc.min ?? 1)) errs.push(`${hit.length} faces wear ${mc.name}, want >= ${mc.min ?? 1}`);
  }
  for (const pa of check.part_at || []) {
    // bounds of one group from its face centers (exact for boxes): min/max per axis
    const fs = faces.filter((f) => f.group != null && new RegExp(pa.group, "i").test(gname(f.group)));
    if (!fs.length) { errs.push(`no group /${pa.group}/`); continue; }
    const tol = pa.tol ?? 0.06;
    for (const [k, fn] of [["min", Math.min], ["max", Math.max]])
      (pa[k] || []).forEach((v, i) => { if (v != null) { const got = fn(...fs.map((f) => f.center[i])); if (!lerr(got, v, tol)) errs.push(`/${pa.group}/ ${k}[${"xyz"[i]}] ${got.toFixed(3)}, want ${v}`); } });
  }
  if (check.roof_rise) {
    const { base, rise, pitch } = check.roof_rise;
    const top = info.bounds ? info.bounds.max[2] : 0;
    const lo = base + rise - 0.15, hi = base + rise + 1.0 * Math.tan((pitch * Math.PI) / 180) + 0.15;
    if (!(top >= lo && top <= hi)) errs.push(`roof top z ${top.toFixed(2)}, want ${lo.toFixed(2)}..${hi.toFixed(2)} for the pitch`);
  }
  for (const t of check.tags || []) if (!(t in (info.tags || {}))) errs.push(`no tag ${t}`);
  for (const r of check.reply || []) {
    const found = replies.some((x) => typeof x[r.key] === "number" && lerr(x[r.key], r.approx, r.tol ?? Math.max(0.05, Math.abs(r.approx) * 0.02)));
    if (!found) errs.push(`no reply with ${r.key} ~ ${r.approx}`);
  }
  if (check.plan) errs.push(...gradePlan(check.plan, replies));
  // room: "Name" -> some reply is room_info about that room
  if (check.room && !replies.some((x) => x.room === check.room && typeof x.area_m2 === "number" && (check.area_ft2 == null || Math.abs(x.area_ft2 - check.area_ft2) <= 1))) errs.push(`no room_info reply about "${check.room}"${check.area_ft2 != null ? ` with ${check.area_ft2} ft2` : ""}`);
  return errs;
}

const nname = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
export function gradePlan(want, replies) {
  const errs = [];
  const got = replies.find((x) => Array.isArray(x.floors));
  if (!got) return ["no floorplan_build reply"];
  if (got.floors.length !== want.floors.length) errs.push(`floors: ${got.floors.length}, want ${want.floors.length}`);
  for (const [i, wf] of want.floors.entries()) {
    const gf = got.floors[i];
    if (!gf) break;
    if (gf.rooms.length !== wf.rooms.length) errs.push(`floor ${i + 1} rooms: ${gf.rooms.length}, want ${wf.rooms.length}`);
    const free = [...gf.rooms];
    for (const [name, area] of wf.rooms) {
      const n = nname(name);
      const k = free.findIndex((r) => { const m = nname(r.name); return m === n || (m && n && (m.includes(n) || n.includes(m))); });
      if (k < 0) { errs.push(`floor ${i + 1}: no room "${name}"`); continue; }
      const a = free[k].gross_area;
      free.splice(k, 1);
      if (Math.abs(a - area) > Math.max(want.tol ?? 0.2, area * 0.04)) errs.push(`floor ${i + 1} ${name}: ${a.toFixed(2)} m2, want ${area.toFixed(2)}`);
    }
    for (const [kind, n] of Object.entries(wf.openings || {})) {
      const m = gf.openings.filter((o) => o.kind === kind).length;
      if (m !== n) errs.push(`floor ${i + 1} ${kind}s: ${m}, want ${n}`);
    }
  }
  return errs;
}
