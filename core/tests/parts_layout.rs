//! `parts` says where each part is and which way it lies, and `parts_layout` answers where every part would lie
//! flat on the ground, without changing the model (#169).
use glam::{DMat4, DVec3};
use serde_json::{json, Value};
use sketchcraft::policy::{Caller, Workspace};
use sketchcraft::Engine;

fn run(e: &mut Engine, v: Value) -> Value {
    let r = e.exec_json(&v.to_string());
    assert_eq!(r["ok"], true, "{v} -> {r}");
    r
}

/// A box from `lo` to `hi` as its own group.
fn board(e: &mut Engine, name: &str, lo: [f64; 3], hi: [f64; 3]) -> u64 {
    let g = run(e, json!({"cmd":"begin_group","name":name}))["group"].as_u64().unwrap();
    let f = run(e, json!({"cmd":"rect","from":[lo[0],lo[1],lo[2]],"to":[hi[0],hi[1],lo[2]]}))["face"].as_u64().unwrap();
    run(e, json!({"cmd":"pushpull","face":f,"distance":hi[2]-lo[2],"toward":[0,0,1]}));
    run(e, json!({"cmd":"end_group"}));
    g
}

const T: f64 = 0.018;
const W: f64 = 0.8;
const D: f64 = 0.3;
const H: f64 = 1.2;

struct Bookcase {
    side_left: u64,
    brace: u64,
    shelves: [u64; 3],
}

/// A bookcase of 13 parts: ten boards as groups (four of them in a nested group, one turned 35 degrees), one
/// component placed three times, and a loose face that is no part.
fn bookcase(e: &mut Engine) -> Bookcase {
    let side_left = board(e, "Side left", [0.0, 0.0, 0.08], [T, D, H]);
    board(e, "Side right", [W - T, 0.0, 0.08], [W, D, H]);
    board(e, "Top", [T, 0.0, H - T], [W - T, D, H]);
    board(e, "Bottom", [T, 0.0, 0.08], [W - T, D, 0.08 + T]);
    board(e, "Back", [0.0, D, 0.08], [W, D + 0.006, H]);
    let shelf = board(e, "Shelf", [T, 0.0, 0.4], [W - T, D - 0.02, 0.4 + T]);
    let s1 = run(e, json!({"cmd":"make_component","ids":[shelf],"name":"Shelf"}))["instance"].as_u64().unwrap();
    let s2 = run(e, json!({"cmd":"duplicate","ids":[s1],"by":[0,0,0.28]}))["ids"][0].as_u64().unwrap();
    let s3 = run(e, json!({"cmd":"duplicate","ids":[s1],"by":[0,0,0.56]}))["ids"][0].as_u64().unwrap();
    let rails = [
        board(e, "Plinth rail front", [0.0, 0.02, 0.0], [W, 0.02 + T, 0.08]),
        board(e, "Plinth rail back", [0.0, D - 0.02 - T, 0.0], [W, D - 0.02, 0.08]),
        board(e, "Plinth end left", [0.0, 0.02 + T, 0.0], [T, D - 0.02 - T, 0.08]),
        board(e, "Plinth end right", [W - T, 0.02 + T, 0.0], [W, D - 0.02 - T, 0.08]),
    ];
    run(e, json!({"cmd":"group","ids":rails,"name":"Plinth"}));
    let brace = board(e, "Brace", [0.1, D + 0.006, 0.3], [0.7, D + 0.006 + T, 0.36]);
    run(e, json!({"cmd":"rotate","ids":[brace],"center":[0.4, D + 0.015, 0.33],"axis":[0,1,0],"angle":35}));
    run(e, json!({"cmd":"rect","from":[1.0,0.0,0.0],"to":[1.2,0.2,0.0]}));
    Bookcase { side_left, brace, shelves: [s1, s2, s3] }
}

fn v3(v: &Value) -> DVec3 {
    DVec3::new(v[0].as_f64().unwrap(), v[1].as_f64().unwrap(), v[2].as_f64().unwrap())
}

fn sizes(p: &Value) -> [f64; 3] {
    [p["size"][0].as_f64().unwrap(), p["size"][1].as_f64().unwrap(), p["size"][2].as_f64().unwrap()]
}

/// A part's frame as `parts` gives it: where its box starts, its three axes, and how far it reaches along each.
struct Frame {
    origin: DVec3,
    u: DVec3,
    w: DVec3,
    n: DVec3,
    extent: DVec3,
}

fn frame(p: &Value) -> Frame {
    Frame { origin: v3(&p["origin"]), u: v3(&p["axes"]["u"]), w: v3(&p["axes"]["w"]), n: v3(&p["axes"]["n"]), extent: v3(&p["extent"]) }
}

impl Frame {
    /// The eight corners of the part's box.
    fn corners(&self) -> Vec<DVec3> {
        let mut out = Vec::new();
        for a in [0.0, self.extent.x] {
            for b in [0.0, self.extent.y] {
                for c in [0.0, self.extent.z] {
                    out.push(self.origin + self.u * a + self.w * b + self.n * c);
                }
            }
        }
        out
    }
}

fn bounds(points: &[DVec3]) -> (DVec3, DVec3) {
    points.iter().fold((DVec3::splat(f64::MAX), DVec3::splat(f64::MIN)), |(lo, hi), p| (lo.min(*p), hi.max(*p)))
}

fn close(a: DVec3, b: DVec3, tol: f64) -> bool {
    (a - b).abs().max_element() < tol
}

fn mat(p: &Value) -> DMat4 {
    let a: Vec<f64> = p["transform"].as_array().expect("a transform").iter().map(|x| x.as_f64().unwrap()).collect();
    assert_eq!(a.len(), 16);
    DMat4::from_cols_array(&a.try_into().unwrap())
}

fn by_id(list: &[Value], id: u64) -> &Value {
    list.iter().find(|p| p["id"] == id).unwrap_or_else(|| panic!("no part {id}"))
}

#[test]
fn parts_say_where_each_part_is_and_which_way_it_lies() {
    let mut e = Engine::new();
    let b = bookcase(&mut e);
    let parts = run(&mut e, json!({"cmd":"parts"}))["parts"].as_array().unwrap().clone();
    assert_eq!(parts.len(), 13);
    for p in &parts {
        let f = frame(p);
        // three unit axes at right angles, right-handed: w is n x u
        for a in [f.u, f.w, f.n] {
            assert!((a.length() - 1.0).abs() < 1e-9, "{p}");
        }
        assert!(f.u.dot(f.w).abs() < 1e-9 && f.u.dot(f.n).abs() < 1e-9 && f.w.dot(f.n).abs() < 1e-9, "{p}");
        assert!(close(f.n.cross(f.u), f.w, 1e-9), "{p}");
        // for a plain board the reach along length, width and thickness is its size
        let s = sizes(p);
        assert!(close(f.extent, DVec3::from(s), 1e-4), "{p}");
    }
    // the size is what it was before `parts` said more (Cut list reads it)
    let size_of = |id: u64| sizes(by_id(&parts, id));
    assert_eq!(size_of(b.side_left), [1.12, 0.3, 0.018]);
    assert_eq!(size_of(b.brace), [0.6, 0.06, 0.018]);
    assert_eq!(size_of(b.shelves[1]), [0.764, 0.28, 0.018]);

    // a standing board: thickness along red, length along blue, and its box is where the board is
    let side = frame(by_id(&parts, b.side_left));
    assert!(side.n.x.abs() > 0.999 && side.u.z.abs() > 0.999, "n {} u {}", side.n, side.u);
    let (lo, hi) = bounds(&side.corners());
    assert!(close(lo, DVec3::new(0.0, 0.0, 0.08), 1e-6) && close(hi, DVec3::new(T, D, H), 1e-6), "{lo} {hi}");

    // a board turned 35 degrees: its length runs along the turned direction, not along a model axis
    let brace = frame(by_id(&parts, b.brace));
    let turned = DVec3::new(35f64.to_radians().cos(), 0.0, -35f64.to_radians().sin());
    assert!(brace.u.dot(turned).abs() > 0.999_999, "u {}", brace.u);
    assert!(brace.n.y.abs() > 0.999, "n {}", brace.n);
    let middle = brace.corners().iter().sum::<DVec3>() / 8.0;
    assert!(close(middle, DVec3::new(0.4, D + 0.015, 0.33), 1e-6), "{middle}");

    // a component placement: the box is where that placement sits
    let shelf = frame(by_id(&parts, b.shelves[1]));
    let (lo, hi) = bounds(&shelf.corners());
    assert!(close(lo, DVec3::new(T, 0.0, 0.68), 1e-6) && close(hi, DVec3::new(W - T, D - 0.02, 0.68 + T), 1e-6), "{lo} {hi}");
}

#[test]
fn parts_layout_lays_every_part_flat_and_leaves_the_model_alone() {
    let mut e = Engine::new();
    bookcase(&mut e);
    let before = serde_json::to_string(&e.model).unwrap();
    let parts = run(&mut e, json!({"cmd":"parts"}))["parts"].as_array().unwrap().clone();
    let r = run(&mut e, json!({"cmd":"parts_layout"}));
    let laid = r["parts"].as_array().unwrap().clone();

    // every part once, nothing doubled, and the model is as it was
    assert_eq!(laid.len(), 13);
    let mut ids: Vec<u64> = laid.iter().map(|p| p["id"].as_u64().unwrap()).collect();
    ids.sort();
    ids.dedup();
    let mut want: Vec<u64> = parts.iter().map(|p| p["id"].as_u64().unwrap()).collect();
    want.sort();
    assert_eq!(ids, want);
    assert_eq!(serde_json::to_string(&e.model).unwrap(), before);
    assert_eq!(run(&mut e, json!({"cmd":"parts"}))["parts"].as_array().unwrap().len(), 13);

    let gap = r["gap"].as_f64().unwrap();
    assert!((gap - 0.04 * 1.12).abs() < 1e-9, "4% of the longest part, got {gap}");
    let ground = v3(&laid[0]["min"]).z;
    assert!(ground.abs() < 1e-9, "the model stands on the ground, so the parts lie on it: {ground}");
    let mut boxes = Vec::new();
    for p in &laid {
        let f = frame(by_id(&parts, p["id"].as_u64().unwrap()));
        let t = mat(p);
        // a turn and a move: no mirroring, no stretching
        let (x, y, z) = (t.x_axis.truncate(), t.y_axis.truncate(), t.z_axis.truncate());
        assert!((x.length() - 1.0).abs() < 1e-9 && (y.length() - 1.0).abs() < 1e-9 && (z.length() - 1.0).abs() < 1e-9, "{p}");
        assert!(x.dot(y).abs() < 1e-9 && x.dot(z).abs() < 1e-9 && y.dot(z).abs() < 1e-9, "{p}");
        assert!((t.determinant() - 1.0).abs() < 1e-9, "{p}");
        // on its biggest face, length along red
        assert!(close(t.transform_vector3(f.n), DVec3::NEG_Z, 1e-9), "{p}");
        assert!(close(t.transform_vector3(f.u), DVec3::X, 1e-9), "{p}");
        // the box it says is the box the part ends up in, resting on the ground
        let moved: Vec<DVec3> = f.corners().iter().map(|c| t.transform_point3(*c)).collect();
        let (lo, hi) = bounds(&moved);
        assert!(close(lo, v3(&p["min"]), 1e-6) && close(hi, v3(&p["max"]), 1e-6), "{p}: {lo} {hi}");
        assert!((lo.z - ground).abs() < 1e-9 && (hi.z - lo.z - f.extent.z).abs() < 1e-6, "{p}");
        assert_eq!(sizes(p), sizes(by_id(&parts, p["id"].as_u64().unwrap())));
        boxes.push((lo, hi));
    }
    // no two parts closer than the gap
    for (i, a) in boxes.iter().enumerate() {
        for b in &boxes[i + 1..] {
            let apart_x = (b.0.x - a.1.x).max(a.0.x - b.1.x);
            let apart_y = (b.0.y - a.1.y).max(a.0.y - b.1.y);
            assert!(apart_x > gap - 1e-9 || apart_y > gap - 1e-9, "{a:?} and {b:?} are closer than {gap}");
        }
    }
    // longest first, and parts of the same size and material next to each other
    let order: Vec<[f64; 3]> = laid.iter().map(sizes).collect();
    assert!(order.windows(2).all(|w| w[0][0] >= w[1][0]), "{order:?}");
    let shelves: Vec<usize> = laid.iter().enumerate().filter(|(_, p)| p["name"] == "Shelf").map(|(i, _)| i).collect();
    assert_eq!(shelves, vec![shelves[0], shelves[0] + 1, shelves[0] + 2]);
    // the whole lay-out is reported, and sits under the model: same middle on the ground
    let (lo, hi) = (v3(&r["bounds"]["min"]), v3(&r["bounds"]["max"]));
    let (all_lo, all_hi) = boxes.iter().fold((DVec3::splat(f64::MAX), DVec3::splat(f64::MIN)), |(lo, hi), b| (lo.min(b.0), hi.max(b.1)));
    assert!(close(lo, all_lo, 1e-9) && close(hi, all_hi, 1e-9));
    let mid = (lo + hi) / 2.0;
    assert!((mid.x - 0.4).abs() < 1e-6 && (mid.y - 0.162).abs() < 1e-6, "{mid}");
}

#[test]
fn a_laid_out_part_really_lies_flat_when_the_transform_is_applied() {
    let mut e = Engine::new();
    let b = bookcase(&mut e);
    let laid = run(&mut e, json!({"cmd":"parts_layout"}))["parts"].as_array().unwrap().clone();
    for id in [b.side_left, b.brace, b.shelves[2]] {
        let p = by_id(&laid, id);
        // the engine's own move, on a copy of the model
        let mut m = e.model.clone();
        m.transform(&[id as _], mat(p)).unwrap();
        let after = sketchcraft::plugins::parts(&m, &[id as _]);
        let f = frame(&after[0]);
        assert!(f.n.z.abs() > 0.999_999 && f.u.x.abs() > 0.999_999, "{id}: n {} u {}", f.n, f.u);
        let (lo, hi) = bounds(&f.corners());
        assert!(close(lo, v3(&p["min"]), 1e-6) && close(hi, v3(&p["max"]), 1e-6), "{id}: {lo} {hi}");
        assert_eq!(sizes(&after[0]), sizes(p));
    }
}

#[test]
fn a_part_that_already_lies_flat_along_red_is_only_moved() {
    let mut e = Engine::new();
    let b = bookcase(&mut e);
    let laid = run(&mut e, json!({"cmd":"parts_layout"}))["parts"].as_array().unwrap().clone();
    // the shelves lie flat with their length along red: no turn, whichever of their two big faces is asked
    for id in b.shelves {
        let t = mat(by_id(&laid, id));
        assert!(close(t.x_axis.truncate(), DVec3::X, 1e-9) && close(t.y_axis.truncate(), DVec3::Y, 1e-9) && close(t.z_axis.truncate(), DVec3::Z, 1e-9), "{id}: {t:?}");
    }
}

#[test]
fn a_part_added_later_lands_in_its_sorted_place() {
    let mut e = Engine::new();
    let b = bookcase(&mut e);
    let names = |e: &mut Engine| -> Vec<(u64, String)> {
        run(e, json!({"cmd":"parts_layout"}))["parts"].as_array().unwrap().iter().map(|p| (p["id"].as_u64().unwrap(), p["name"].as_str().unwrap().to_string())).collect()
    };
    let first = names(&mut e);
    // a fourth shelf, and a rail 900 mm long that is like nothing else
    let s4 = run(&mut e, json!({"cmd":"duplicate","ids":[b.shelves[0]],"by":[0,0,-0.2]}))["ids"][0].as_u64().unwrap();
    let rail = board(&mut e, "Hanging rail", [0.0, -0.5, 0.0], [0.9, -0.45, T]);
    let second = names(&mut e);
    assert_eq!(second.len(), 15);
    // the four shelves lie together
    let shelves: Vec<usize> = second.iter().enumerate().filter(|(_, p)| p.1 == "Shelf").map(|(i, _)| i).collect();
    assert_eq!(shelves, (shelves[0]..shelves[0] + 4).collect::<Vec<_>>());
    assert!(shelves.iter().any(|&i| second[i].0 == s4));
    // the rail comes after the three 1120 mm parts and before the 800 mm ones
    let at = second.iter().position(|p| p.0 == rail).unwrap();
    assert_eq!(at, 3, "{second:?}");
    // and the parts that were there keep their order
    let kept: Vec<_> = second.iter().filter(|p| p.0 != s4 && p.0 != rail).cloned().collect();
    assert_eq!(kept, first);
}

#[test]
fn parts_layout_takes_chosen_parts_and_a_gap_and_refuses_a_bad_one() {
    let mut e = Engine::new();
    let b = bookcase(&mut e);
    let r = run(&mut e, json!({"cmd":"parts_layout","ids":[b.side_left, b.brace],"gap":0.25}));
    let laid = r["parts"].as_array().unwrap();
    assert_eq!(laid.len(), 2);
    assert_eq!(r["gap"], 0.25);
    assert_eq!(laid[0]["id"], b.side_left);
    let (a, c) = ((v3(&laid[0]["min"]), v3(&laid[0]["max"])), (v3(&laid[1]["min"]), v3(&laid[1]["max"])));
    let apart = (c.0.x - a.1.x).max(a.0.x - c.1.x).max((c.0.y - a.1.y).max(a.0.y - c.1.y));
    assert!((apart - 0.25).abs() < 1e-9, "{apart}");
    for bad in [json!(-0.01), json!(11)] {
        let r = e.exec_json(&json!({"cmd":"parts_layout","gap":bad}).to_string());
        assert_eq!(r["ok"], false, "{r}");
        assert!(r["error"].as_str().unwrap().contains("gap"), "{r}");
    }
    // nothing to lay out is an empty answer, not an error
    let mut empty = Engine::new();
    let r = run(&mut empty, json!({"cmd":"parts_layout"}));
    assert_eq!(r["parts"].as_array().unwrap().len(), 0);
    assert!(r["bounds"].is_null());
}

#[test]
fn plugins_and_agents_may_ask_for_the_lay_out_and_it_is_no_undo_step() {
    assert!(sketchcraft::policy::permits(&Caller::Plugin, "parts_layout"));
    assert!(sketchcraft::policy::permits(&Caller::Mcp(Workspace::at(std::env::temp_dir())), "parts_layout"));
    let mut e = Engine::new();
    bookcase(&mut e);
    let r = e.exec_json_as(&Caller::Plugin, &json!({"cmd":"parts_layout"}).to_string());
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["parts"].as_array().unwrap().len(), 13);
    // asking is not a change: Undo still takes back the last thing drawn (the loose face), not nothing
    let faces = |e: &mut Engine| run(e, json!({"cmd":"info"}))["faces"].as_u64().unwrap();
    let n = faces(&mut e);
    run(&mut e, json!({"cmd":"undo"}));
    assert_eq!(faces(&mut e), n - 1);
}

/// A board 800 x 300 x 18 mm lying flat along red whose long sides are each four 200 mm edges (as a curve's
/// segments or a row of notches leave them): its longest single edge is a 300 mm end.
fn segmented_board(e: &mut Engine, turn_deg: f64) -> u64 {
    let g = run(e, json!({"cmd":"begin_group","name":"Segmented"}))["group"].as_u64().unwrap();
    let pts = [[0.0, 0.0], [0.2, 0.0], [0.4, 0.0], [0.6, 0.0], [0.8, 0.0], [0.8, 0.3], [0.6, 0.3], [0.4, 0.3], [0.2, 0.3], [0.0, 0.3]];
    let f = run(e, json!({"cmd":"polygon","points":pts.map(|p| [p[0], p[1], 0.0])}))["face"].as_u64().unwrap();
    run(e, json!({"cmd":"pushpull","face":f,"distance":T,"toward":[0,0,1]}));
    run(e, json!({"cmd":"end_group"}));
    if turn_deg != 0.0 {
        run(e, json!({"cmd":"rotate","ids":[g],"center":[0,0,0],"axis":[0,0,1],"angle":turn_deg}));
    }
    g
}

#[test]
fn length_is_the_parts_long_way_even_when_its_long_side_is_many_short_edges() {
    for turn in [0.0, 90.0, 25.0] {
        let mut e = Engine::new();
        let g = segmented_board(&mut e, turn);
        assert_eq!(e.model.faces.values().map(|f| f.outer.len()).max(), Some(10), "the long sides keep their short edges");
        let p = run(&mut e, json!({"cmd":"parts"}))["parts"][0].clone();
        let f = frame(&p);
        assert_eq!(sizes(&p), [0.8, 0.3, 0.018]);
        // u runs along the 800 mm, whatever the single longest edge is
        let long = DVec3::new(turn.to_radians().cos(), turn.to_radians().sin(), 0.0);
        assert!(f.u.dot(long).abs() > 0.999_999, "turned {turn}: u {}", f.u);
        assert!(close(f.extent, DVec3::new(0.8, 0.3, 0.018), 1e-9), "turned {turn}: {}", f.extent);
        // laid out, the board itself (not just its reported frame) is 800 along red and 300 along green
        let laid = run(&mut e, json!({"cmd":"parts_layout"}))["parts"][0].clone();
        let mut m = e.model.clone();
        m.transform(&[g as _], mat(&laid)).unwrap();
        let (lo, hi) = m.world_bounds().unwrap();
        assert!(close(hi - lo, DVec3::new(0.8, 0.3, 0.018), 1e-9), "turned {turn}: {}", hi - lo);
        assert!(close(lo, v3(&laid["min"]), 1e-9) && close(hi, v3(&laid["max"]), 1e-9), "turned {turn}: {lo} {hi}");
    }
}
