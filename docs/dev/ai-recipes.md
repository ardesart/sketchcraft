# Bring your own AI: setup and recipes

SketchCraft has no AI service of its own to subscribe to. `sketchcraft mcp` is a
local [Model Context Protocol](https://modelcontextprotocol.io) server, so any
AI program that can start an MCP server can drive it: you use whatever you
already have. This page gets one connected and gives four things to ask for. How
the server works and what an agent may do: [AI agents over MCP](mcp.md).

## Connect in five steps

1. **Get the CLI.** Download `sketchcraft-cli-<platform>.zip` from the
   [releases](https://github.com/jasonsutter87/sketchcraft/releases/latest), or
   build it with `cargo build --release -p sketchcraft-core` (the binary is
   `target/release/sketchcraft`).
2. **Find the live model file** the app uses:
   `~/Documents/SketchCraft/live.sketchcraft`, or the path in the
   `SKETCHCRAFT_DOC` environment variable if you set one. That is what `--doc`
   points at below.
3. **Tell your AI program how to start the server.** In Claude Code that is a
   `.mcp.json` in your project; use the full path to the binary and your own
   home folder:

   ```json
   {
     "mcpServers": {
       "sketchcraft": {
         "command": "/path/to/sketchcraft",
         "args": ["mcp", "--doc", "/Users/you/Documents/SketchCraft/live.sketchcraft"]
       }
     }
   }
   ```

   Another MCP client (Cursor, or a program that runs a local model) takes the
   same `command` and `args` in its own MCP settings. Only Claude Code is
   described here; check the other program's documentation for where the entry
   goes.
4. **Start your AI program and ask:** "What is in my SketchCraft model?" It
   uses `sketchcraft_info`. Your model's names and text come back marked as data,
   so words inside a file can't give it orders.
5. **Ask for something small**, such as one of the recipes below, and watch it
   appear in the app within a second. `--doc` makes you and the agent edit the
   same model, each with its own Undo (see
   [Working alongside the app](mcp.md#working-alongside-the-app)).

Ask it to look at its work with `sketchcraft_render`; it gets the picture back.
Units are meters and Z is up. An agent can use only the commands listed in
[AI agents over MCP](mcp.md#what-an-agent-may-do) and [Scripting](scripting.md);
for files it works inside the folder of the `--doc` model.

## Recipes

Each recipe is a request you can paste, then the commands the agent ends up
sending, so you can see what to expect. The agent may choose slightly different
numbers. Say "as one undo step" and it wraps them in `begin_batch` / `end_batch`.

### A railing

> Build a straight railing 4 m long along the X axis at the origin: 5 square
> posts 6 cm wide and 95 cm high, 1 m apart, with a top rail across them. One
> undo step.

```json
{"cmd":"begin_batch"}
{"cmd":"column","at":[0,0,0],"size":0.06,"height":0.95,"as":"post"}
{"cmd":"array","ids":["@post"],"by":[1,0,0],"count":4}
{"cmd":"rect","from":[-0.03,-0.04,0.95],"to":[4.03,0.04,0.95],"as":"rail"}
{"cmd":"pushpull","face":"@rail","distance":0.05}
{"cmd":"end_batch"}
```

`array`'s `count` is the number of extra copies, so 4 gives 5 posts. Ask it to
`classify` the posts and rail as `IfcRailing` if you are going to export IFC.

### Stairs

> Add a straight stair 1 m wide that climbs 2.7 m, starting at the origin and
> running along +X.

```json
{"cmd":"stairs","at":[0,0,0],"rise":2.7,"direction":0,"width":1.0}
```

The reply says how many risers it made (15 of 18 cm for this rise).
`direction` is in degrees from +X; `tread` sets the tread depth.

### Furnish a room

> Make a 4 m by 3.5 m bedroom called Bedroom, put a queen bed against the south
> wall and a nightstand next to it.

```json
{"cmd":"room_rect","from":[0,0,0],"to":[4,3.5,0],"name":"Bedroom"}
{"cmd":"insert","asset":"queen_bed","at":[2,0.1,0],"rotate":180}
{"cmd":"insert","asset":"nightstand","at":[0.6,0.1,0],"rotate":180}
```

The walls are 20 cm thick and centered on the rectangle, so the inside face of
the south wall is at y = 0.1. A fixture's back is its y = 0 plane and its front
faces -Y, so against the south wall it needs `rotate: 180` (see
[Fixtures and furniture](fixtures.md)). The names to ask for are the 26 fixtures
listed there (`toilet`, `sofa`, `dining_set`, `fridge` and so on); `assets` lists
every built-in. Ask the agent to render the room to check that nothing pokes
through a wall.

### A permit set

> Lay out a permit set for this model on A2 paper at 1:50, dimension the plans,
> and show me the sheets.

```json
{"cmd":"layout_preset","preset":"permit","paper":"a2","scale":"1:50"}
```

then `dimension_auto` for each plan viewport the reply lists (`scope`: `exterior`,
`openings`, `interior`, `grids`) and `sheet_render` to look at the result. The
sheets are ordinary saved sheets (cover and index, a plan per floor, the four
elevations, a section through the stairs if there are any, the door and window
schedule), editable in the app. It refuses an empty model, and issuing a set is
left to you: an agent can prepare one, not issue it. To get a PDF, ask for
`export_sheets` to a `.pdf` inside the model's folder. The drafting commands are
described in [the drafting design](drafting-design.md).

## If it does not work

- The AI program says it has no SketchCraft tools: the server did not start.
  Run the same command in a terminal (`sketchcraft mcp --doc <file>`); it prints
  `sketchcraft mcp: files limited to <folder>` and then waits for input.
- "Won't start" with no `--doc` and no `--workspace`: the server needs one of
  them so it knows which folder an agent may use.
- Nothing shows in the app: the app must have the same file open as `--doc`.
