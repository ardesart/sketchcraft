# Writing a SketchCraft plugin

(Have a SketchUp Ruby extension instead? Many run as they are: see
[SketchUp Ruby scripts](dev/sketchup-ruby.md).)

A plugin adds commands to SketchCraft. It's a folder with two files:

```
~/Documents/SketchCraft/Plugins/
  my-plugin/
    plugin.json
    main.js
```

**File › Plugins ▸ Open plugins folder…** opens that folder. New plugins show up
the next time you open the Plugins menu, and in Shift+S.

## plugin.json

```json
{
  "name": "Board feet",
  "version": "1.0.0",
  "author": "You",
  "description": "Totals the board feet of the selected parts.",
  "commands": [
    { "id": "board-feet", "label": "Board feet…", "hint": "Board feet of the selection" }
  ]
}
```

### A tool bar button

Give a command an `"icon"` and it gets a button on the tool bar (in its own
group at the end, kept visible when the bar is short of room):

```json
{ "id": "board-feet", "label": "Board feet…", "icon": "board-feet.svg" }
```

The icon is an SVG or PNG file beside `main.js` (up to 256 KB), or SVG written
inline (`"icon": "<svg xmlns=…>…</svg>"`). Draw it on a 24 × 24 grid; a
mid-grey stroke reads on light and dark themes.

## main.js

```js
sketchcraft.command("board-feet", async (ctx) => {
  const ids = [...ctx.selection.groups, ...ctx.selection.instances];
  const { parts } = await ctx.run({ cmd: "parts", ids });
  const inches = (m) => m / 0.0254;
  const bf = parts.reduce((t, p) => t + (inches(p.size[0]) * inches(p.size[1]) * inches(p.size[2])) / 144, 0);
  ctx.show({
    title: "Board feet",
    text: `${bf.toFixed(1)} board feet in ${parts.length} parts.`,
    table: { columns: ["Part", "Board feet"], rows: parts.map((p) => [p.name, ((inches(p.size[0]) * inches(p.size[1]) * inches(p.size[2])) / 144).toFixed(2)]) },
  });
});
```

The built-in **Cut list** plugin is a longer example:
[core/plugins/cutlist/main.js](../core/plugins/cutlist/main.js).

## The API

`sketchcraft.command(id, fn)` adds a command. `fn(ctx)` runs when it's picked,
and can be `async`. `ctx` has:

| | |
| --- | --- |
| `ctx.selection` | `{ faces, edges, groups, instances }`: ids of what's selected |
| `ctx.units` | the model's units: `"m"`, `"cm"`, `"mm"`, `"ft"` or `"in"` (sizes are always meters) |
| `ctx.run(cmd)` | run an engine command, returns its reply (`{ ok, ... }` or `{ ok: false, error }`) |
| `ctx.show({ title, text, table })` | show a result; `table` is `{ columns: [...], rows: [[...], ...] }`, which people can copy or save as CSV |
| `ctx.ask(form)` | shows a form and returns the answers, or `null` if cancelled (below) |
| `ctx.toast(text)` | a short message at the top of the model |

### Forms: `ctx.ask`

```js
const a = await ctx.ask({
  title: "Shelf unit",
  text: "A line or two about what happens.",
  ok: "Build",
  fields: [
    { id: "width", label: "Width", type: "length", value: 0.8, min: 0.2, max: 4 },
    { id: "count", label: "Shelves", type: "number", value: 3 },
    { id: "wood", label: "Wood", type: "choice", options: ["Pine", "Oak", "Birch ply"] },
    { id: "back", label: "Add a back", type: "check", value: true },
    { id: "note", label: "Label", type: "text", value: "" },
  ],
});
if (!a) return; // cancelled
```

A `length` is typed in the model's units (`2.4m`, `8'`, `90cm`) and comes back
in meters; `min` and `max` are checked before the form closes. Time spent on a
form doesn't count toward the one-minute limit.

## Tools: `sketchcraft.tool`

A command with `"tool": true` in plugin.json starts an interactive tool instead
of running once. The plugin stays running while the tool is in use and gets
every move and click, snapped like SketchCraft's own tools:

```js
let start = null;
sketchcraft.tool("fence", {
  start(ctx) { ctx.hint("Click where the fence starts."); },
  move(ctx, at) { if (start) ctx.preview([[start, at.point]]); },
  async click(ctx, at) {
    if (!start) { start = at.point; ctx.anchor(start); return ctx.hint("Click where it ends."); }
    // ... build with ctx.run, then carry on from here
    start = at.point;
    ctx.anchor(start);
  },
  stop(ctx) {},
});
```

`at` is `{ point: [x, y, z], snap, face, normal, shift, alt }`: `snap` says what
it locked to (`endpoint`, `midpoint`, `center`, `origin`, `on-edge`, `face`,
`ground`, `axis`…) and `face` is the id of the face under the cursor. A tool's
`ctx` also has:

| | |
| --- | --- |
| `ctx.preview(lines)` | lines to draw: `[[from, to], ...]`, in meters; `[]` clears them |
| `ctx.anchor(point)` | where the rubber band and the arrow-key axis locks start (`null`: none) |
| `ctx.hint(text)` | the hint in the corner while the tool runs |
| `ctx.finish()` | leave the tool (Esc or picking another tool does too) |

Each move or click gets ten seconds; moves that arrive while the last one is
still busy are skipped, so keep `move` quick. The built-in
[Framing](../core/plugins/framing/main.js) plugin (Stud wall) is a full example.

`ctx.run` takes the same commands as the CLI and the MCP server: draw, push/pull,
move, paint, group, place components and more (see the README's command
reference). Changes a plugin makes can be undone like any other. Three read-only
commands are handy for plugins:

- `{"cmd": "parts", "ids": [...]}`: each group's or component's name, material
  and `size` as `[length, width, thickness]` in meters, measured along its own
  faces (so a turned board reads right). No ids: every group with nothing
  grouped inside it, and every component. Each part also says where it is and
  which way it lies: `origin` (a corner of its box), `axes` (`u` along its
  length, `w` its width, `n` its thickness, in model space) and `extent` (how
  far it reaches along each). The part fills `origin + a·u + b·w + c·n`.
- `{"cmd": "parts_layout", "ids": [...], "gap": 0.05}`: where each part would
  lie if the model were taken apart and laid flat on the ground: on its biggest
  face, length along red, longest first, parts of the same size and material
  next to each other. Each part comes with a `transform` (16 numbers, a 4 × 4
  matrix by columns: a turn and a move from where the part is to where it
  lies) and the `min` and `max` corners of its box there. Nothing in the model
  moves. `gap` is optional (4% of the longest part, 5 to 100 mm).
- `{"cmd": "info"}`: counts, groups and materials.

## What plugins can't do

Each run gets a fresh, sandboxed worker, and the engine checks every command it
sends:

- no access to the page, the network (`fetch`, `Worker` and friends are gone) or your files;
- the engine only runs modeling and inspection commands for a plugin: drawing,
  editing, grouping, materials, views, measuring. Anything that reads or writes
  files (`save`, `open`, `import_*`, `export_*`, anything with a `path` or
  `out`), launches a program (`animate`, `photoreal`, `add_location`), manages
  plugins (`install_plugin`, `plugin_enable`, `remove_plugin`) or touches your
  skins and library is refused. This is enforced in the engine, so it holds for
  JavaScript plugins and SketchUp Ruby scripts alike;
- a run that takes over a minute is stopped (a tool: ten seconds per click or move);
- what a plugin shows (results, forms) is checked and cut down, and always
  carries a note saying it comes from that plugin.

So a plugin can change your model (and you can undo that), but it can't send
anything anywhere or touch other files. Installing one shows what it is (kind,
files, a fingerprint) first, and replacing an installed plugin asks.
