# Townhouse fixture (route 2 test case, never trained on)

`townhouse.plan.json` is the owner's two-story townhouse drawing (sheet A-101, 22' x 48' end unit, 3 bed, 2 bath,
1-car garage) as a `floorplan_build` plan, in meters. The drawing's front (garage door, entry) is south (-Y);
x runs left to right as drawn. Choices made where the drawing doesn't say:

- Drawing lines are treated as wall centerlines; one wall thickness for all walls, 0.15 m (the drawing's
  exterior walls are thicker; overall dimensions are "to exterior face", so the model is about 0.15 m larger).
- Kitchen (10' x 15') and Living / Dining (12' x 15') are two rooms with no wall between them (kind "open").
  The drawing's Primary Bedroom door straddles their split line; it is moved about 2' left, into the Kitchen wall.
- Unnamed spaces got names: main-floor "Hall" (between laundry and stair), "Stair" rooms on both floors
  (upstairs it has no floor: the stairwell). The upstairs Hall includes the stair landing (L-shaped), the Loft
  includes the strip beside the stairwell (L-shaped).
- Open connections (no wall drawn): Hall to Kitchen/Living, Hall and Stair to Foyer; upstairs Hall to Loft and
  to the stairwell.
- Wall heights: main 2.6 m (8'6"; the stair from the drawing's 12' run fits), upper 2.45 m (8').
  Upper floor sits on the main walls (no floor slab thickness).
- Bed 2's door is drawn partly over Bath 2's wall; it is centered on the Bed 2 / Hall wall instead.
- Doors 2'6"-3' as drawn (laundry 4' bifold as a 4' door, garage overhead door 8' x 7'); windows as drawn
  in width, 1.2 m tall at 0.9 m sill (Bath 1: 0.9 m tall at 1.2 m sill). Left side is the party wall: no windows.
- Not modeled: closets in Bed 2/Bed 3, fixtures, the roof over the single-story rear (Primary suite), and the
  upper floor's roof.

## townhouse-2br.plan.json

The owner's second drawing ("2BR"): the same house, but upstairs Bed 2 and Bed 3 are one full-width Bed 2
(22' x 12', 264 SF) with a single door to the hall (centered on the Bed 2 / Hall wall, as above) and all three
upper bedroom windows. Everything else and every choice above is the same. Regenerate with `townhouse.mjs 2br`.
