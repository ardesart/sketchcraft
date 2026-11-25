//! `lay_out_parts`: the view and renders show the parts laid out flat, worked out from the model each time, while
//! the model itself never moves and changes wait until the view is switched off (#169, step 2).
use glam::DVec3;
use serde_json::{json, Value};
use sketchcraft::live::Live;
use sketchcraft::policy::{Caller, Workspace};
use sketchcraft::Engine;

fn run(e: &mut Engine, v: Value) -> Value {
    let r = e.exec_json(&v.to_string());
    assert_eq!(r["ok"], true, "{v} -> {r}");
    r
}

fn board(e: &mut Engine, name: &str, lo: [f64; 3], hi: [f64; 3]) -> u64 {
    let g = run(e, json!({"cmd":"begin_group","name":name}))["group"].as_u64().unwrap();
    let f = run(e, json!({"cmd":"rect","from":[lo[0],lo[1],lo[2]],"to":[hi[0],hi[1],lo[2]]}))["face"].as_u64().unwrap();
    run(e, json!({"cmd":"pushpull","face":f,"distance":hi[2]-lo[2],"toward":[0,0,1]}));
    run(e, json!({"cmd":"end_group"}));
    g
}

const T: f64 = 0.018;

/// A small cabinet: two sides, a top, a shelf placed twice as a component, two plinth boards inside a group, a
/// dimension, a guide and a loose face.
fn cabinet(e: &mut Engine) -> (u64, [u64; 2]) {
    let side = board(e, "Side", [0.0, 0.0, 0.0], [T, 0.4, 0.9]);
    board(e, "Side", [0.6 - T, 0.0, 0.0], [0.6, 0.4, 0.9]);
    board(e, "Top", [0.0, 0.0, 0.9], [0.6, 0.4, 0.9 + T]);
    let shelf = board(e, "Shelf", [T, 0.0, 0.3], [0.6 - T, 0.38, 0.3 + T]);
    let s1 = run(e, json!({"cmd":"make_component","ids":[shelf],"name":"Shelf"}))["instance"].as_u64().unwrap();
    let s2 = run(e, json!({"cmd":"duplicate","ids":[s1],"by":[0,0,0.3]}))["ids"][0].as_u64().unwrap();
    let a = board(e, "Plinth front", [0.0, 0.02, -0.08], [0.6, 0.02 + T, 0.0]);
    let b = board(e, "Plinth back", [0.0, 0.36, -0.08], [0.6, 0.36 + T, 0.0]);
    run(e, json!({"cmd":"group","ids":[a, b],"name":"Plinth"}));
    run(e, json!({"cmd":"dimension","from":[0,0,0.9],"to":[0.6,0,0.9],"offset":[0,-0.1,0]}));
    run(e, json!({"cmd":"guide","point":[0,0,0],"direction":[1,0,0]}));
    run(e, json!({"cmd":"rect","from":[1.0,0.0,0.0],"to":[1.2,0.2,0.0]}));
    (side, [s1, s2])
}

fn v3(v: &Value) -> DVec3 {
    DVec3::new(v[0].as_f64().unwrap(), v[1].as_f64().unwrap(), v[2].as_f64().unwrap())
}

fn saved(e: &Engine) -> String {
    serde_json::to_string(&e.model).unwrap()
}

#[test]
fn laid_out_the_view_shows_every_part_flat_where_parts_layout_puts_it() {
    let mut e = Engine::new();
    cabinet(&mut e);
    let before = saved(&e);
    let layout = run(&mut e, json!({"cmd":"parts_layout"}));
    let r = run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    assert_eq!(r["laid_out"], true);
    assert_eq!(r["parts"].as_array().unwrap().len(), 7);
    assert_eq!(r["loose_faces"], 1, "the loose face is no part, and the view says it is left out");
    assert_eq!(saved(&e), before, "turning the view on moves nothing in the model");

    let view = e.laid_out_view().expect("laid out");
    // every face drawn belongs to a part and lies inside that part's box from parts_layout
    let boxes: Vec<(u64, DVec3, DVec3)> = layout["parts"].as_array().unwrap().iter().map(|p| (p["id"].as_u64().unwrap(), v3(&p["min"]), v3(&p["max"]))).collect();
    let drawn = view.model.world_faces();
    assert_eq!(drawn.len(), 7 * 6, "six faces for each of the seven boards, nothing else");
    for f in &drawn {
        let owner = match f.group {
            Some(g) => g as u64,
            None => f.owner as u64, // a face inside a component: its top-level placement
        };
        let (_, lo, hi) = boxes.iter().find(|b| b.0 == owner).unwrap_or_else(|| panic!("face of {owner} is not a part"));
        for p in &f.outer {
            assert!(p.cmpge(*lo - DVec3::splat(1e-9)).all() && p.cmple(*hi + DVec3::splat(1e-9)).all(), "{owner}: {p} outside {lo}..{hi}");
        }
    }
    // all of it on the ground, under the cabinet (the plinth reaches 80 mm below zero)
    let (lo, hi) = view.model.world_bounds().unwrap();
    assert!((lo.z + 0.08).abs() < 1e-9 && hi.z - lo.z < T + 1e-9, "{lo} {hi}");
    // notes and guides point at places in the assembled model: not drawn
    assert!(view.model.annotations.is_empty() && view.model.guides.is_empty());

    run(&mut e, json!({"cmd":"lay_out_parts","on":false}));
    assert!(e.laid_out_view().is_none());
    assert_eq!(saved(&e), before);
}

#[test]
fn laid_out_changes_are_refused_until_it_is_switched_off() {
    let mut e = Engine::new();
    let (side, _) = cabinet(&mut e);
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    let before = saved(&e);
    for cmd in [
        json!({"cmd":"rect","from":[2,0,0],"to":[3,1,0]}),
        json!({"cmd":"move","ids":[side],"by":[1,0,0]}),
        json!({"cmd":"delete","ids":[side]}),
        json!({"cmd":"undo"}),
        json!({"cmd":"begin_batch"}),
    ] {
        let r = e.exec_json(&cmd.to_string());
        assert_eq!(r["ok"], false, "{cmd} -> {r}");
        assert_eq!(r["laid_out"], true, "{cmd} -> {r}");
        assert!(r["error"].as_str().unwrap().contains("Lay out parts"), "{r}");
    }
    assert_eq!(saved(&e), before);
    // looking still works
    run(&mut e, json!({"cmd":"parts"}));
    run(&mut e, json!({"cmd":"info"}));
    // switched off, the same change goes through
    run(&mut e, json!({"cmd":"lay_out_parts","on":false}));
    run(&mut e, json!({"cmd":"move","ids":[side],"by":[1,0,0]}));
}

#[test]
fn the_view_is_worked_out_from_the_model_as_it_is_now() {
    let mut e = Engine::new();
    cabinet(&mut e);
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    assert_eq!(e.laid_out_view().unwrap().laid.len(), 7);
    // the model changes while the view is on (the person's own edits are refused, so change it behind the gate;
    // a save by another program is the reload test below): the view follows
    let asked = e.laid_out.take();
    let back = board(&mut e, "Back", [0.0, 0.4, 0.0], [0.6, 0.406, 0.9]);
    e.laid_out = asked;
    let view = e.laid_out_view().unwrap();
    assert_eq!(view.laid.len(), 8);
    let at = view.laid.iter().find(|l| l.part.id as u64 == back).expect("the new back is laid out");
    // on the same ground as the rest (the plinth's underside, 80 mm below zero), lying on its 6 mm
    assert!((at.min.z + 0.08).abs() < 1e-9 && (at.max.z - at.min.z - 0.006).abs() < 1e-9, "{} {}", at.min, at.max);
}

#[test]
fn render_draws_the_laid_out_parts_while_the_view_is_on() {
    let mut e = Engine::new();
    cabinet(&mut e);
    let target = |e: &mut Engine| v3(&run(e, json!({"cmd":"render"}))["camera"]["target"]);
    let assembled = target(&mut e);
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    let laid = target(&mut e);
    let view = e.laid_out_view().unwrap();
    let expected = sketchcraft::render::camera_for(&view.model, &sketchcraft::render::RenderOpts::default());
    assert!((laid - DVec3::from(expected.target)).length() < 1e-9, "{laid} vs {:?}", expected.target);
    assert!((laid - assembled).length() > 0.05, "the camera looks at the laid-out parts, not at the cabinet");
    run(&mut e, json!({"cmd":"lay_out_parts","on":false}));
    assert!((target(&mut e) - assembled).length() < 1e-12);
}

#[test]
fn new_and_open_end_the_view_and_editing_a_component_comes_first() {
    let dir = std::env::temp_dir().join(format!("sc-parts-view-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("cabinet.sketchcraft");
    let mut e = Engine::new();
    let (_, shelves) = cabinet(&mut e);
    run(&mut e, json!({"cmd":"save","path":file}));
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    // a file that can't be opened changes nothing, the view included
    let r = e.exec_json(&json!({"cmd":"open","path":dir.join("missing.sketchcraft")}).to_string());
    assert_eq!(r["ok"], false, "{r}");
    assert!(e.laid_out.is_some());
    run(&mut e, json!({"cmd":"open","path":file}));
    assert!(e.laid_out.is_none());
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    run(&mut e, json!({"cmd":"new"}));
    assert!(e.laid_out.is_none());
    // inside a component, the view would be of the whole model while the edit goes on: close it first
    run(&mut e, json!({"cmd":"open","path":file}));
    run(&mut e, json!({"cmd":"edit","id":shelves[0]}));
    let r = e.exec_json(&json!({"cmd":"lay_out_parts","on":true}).to_string());
    assert_eq!(r["ok"], false, "{r}");
    assert!(e.laid_out.is_none());
    // a bad gap is refused, and the view stays off
    run(&mut e, json!({"cmd":"close"}));
    let r = e.exec_json(&json!({"cmd":"lay_out_parts","on":true,"gap":-1}).to_string());
    assert_eq!(r["ok"], false, "{r}");
    assert!(e.laid_out.is_none());
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn the_apps_scene_is_the_laid_out_one_and_says_which_parts_it_shows() {
    let dir = std::env::temp_dir().join(format!("sc-parts-view-live-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut live = Live::open(dir.join("m.sketchcraft"));
    for c in [
        json!({"cmd":"begin_group","name":"Board"}),
        json!({"cmd":"rect","from":[0,0,0],"to":[0.3,0.018,0]}),
    ] {
        assert_eq!(live.exec(&c)["ok"], true);
    }
    let f = live.engine.model.faces.keys().copied().max().unwrap();
    assert_eq!(live.exec(&json!({"cmd":"pushpull","face":f,"distance":1.2,"toward":[0,0,1]}))["ok"], true);
    assert_eq!(live.exec(&json!({"cmd":"end_group"}))["ok"], true);
    // a board standing on end
    let standing = live.scene();
    assert!(standing["laid_out"].is_null());
    let top = |s: &Value| s["positions"].as_array().unwrap().chunks(3).map(|p| p[2].as_f64().unwrap()).fold(f64::MIN, f64::max);
    assert!((top(&standing) - 1.2).abs() < 1e-6);
    assert_eq!(live.exec(&json!({"cmd":"lay_out_parts","on":true}))["ok"], true);
    let flat = live.scene();
    assert_eq!(flat["laid_out"]["parts"][0]["name"], "Board");
    assert_eq!(flat["laid_out"]["parts"][0]["size"], json!([1.2, 0.3, 0.018]));
    assert!((top(&flat) - 0.018).abs() < 1e-6, "lying on its biggest face, 18 mm high");
    // the same triangles, moved: picking a laid-out board still names the board
    assert_eq!(standing["triFace"].as_array().unwrap().len(), flat["triFace"].as_array().unwrap().len());
    assert_eq!(live.exec(&json!({"cmd":"lay_out_parts","on":false}))["ok"], true);
    assert!(live.scene()["laid_out"].is_null());
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn plugins_and_agents_may_switch_it_and_it_is_no_undo_step() {
    assert!(sketchcraft::policy::permits(&Caller::Plugin, "lay_out_parts"));
    assert!(sketchcraft::policy::permits(&Caller::Mcp(Workspace::at(std::env::temp_dir())), "lay_out_parts"));
    let mut e = Engine::new();
    cabinet(&mut e);
    let faces = |e: &mut Engine| run(e, json!({"cmd":"info"}))["faces"].as_u64().unwrap();
    let n = faces(&mut e);
    let r = e.exec_json_as(&Caller::Plugin, &json!({"cmd":"lay_out_parts","on":true}).to_string());
    assert_eq!(r["ok"], true, "{r}");
    run(&mut e, json!({"cmd":"lay_out_parts","on":false}));
    // Undo takes back the loose face drawn last, not the switching
    run(&mut e, json!({"cmd":"undo"}));
    assert_eq!(faces(&mut e), n - 1);
}

/// Every drawn face of the view, with the part it belongs to (its group, or its top-level placement).
fn drawn_by_part(view: &sketchcraft::parts_layout::LaidOutView) -> std::collections::BTreeMap<u64, Vec<DVec3>> {
    let mut out: std::collections::BTreeMap<u64, Vec<DVec3>> = Default::default();
    for f in view.model.world_faces() {
        let id = match f.group {
            Some(g) => view.laid.iter().find(|l| l.part.kind == "group" && view.model.subtree(l.part.id).contains(&g)).map(|l| l.part.id as u64).unwrap_or(g as u64),
            None => f.owner as u64,
        };
        out.entry(id).or_default().extend(f.outer.iter().copied());
    }
    out
}

fn inside_its_box(view: &sketchcraft::parts_layout::LaidOutView) {
    let drawn = drawn_by_part(view);
    for l in &view.laid {
        let pts = drawn.get(&(l.part.id as u64)).unwrap_or_else(|| panic!("{} ({}) is not drawn", l.part.name, l.part.id));
        for p in pts {
            assert!(p.cmpge(l.min - DVec3::splat(1e-6)).all() && p.cmple(l.max + DVec3::splat(1e-6)).all(), "{}: {p} outside {}..{}", l.part.name, l.min, l.max);
        }
    }
}

#[test]
fn a_component_placed_by_its_attributes_is_laid_out_too() {
    let mut e = Engine::new();
    let (_, shelves) = cabinet(&mut e);
    // a Dynamic Component placement whose position and turn come from its attributes
    run(&mut e, json!({"cmd":"set_attrs","id":shelves[1],"attrs":{"x":"2","y":"1","z":"0.5","rotx":"90"}}));
    run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
    let view = e.laid_out_view().unwrap();
    inside_its_box(&view);
}

#[test]
fn a_group_that_holds_groups_is_laid_out_whole_when_it_is_asked_for() {
    let mut e = Engine::new();
    cabinet(&mut e);
    let plinth = e.model.groups.iter().find(|(_, g)| g.name == "Plinth").map(|(id, _)| *id as u64).unwrap();
    let r = run(&mut e, json!({"cmd":"lay_out_parts","on":true,"ids":[plinth]}));
    assert_eq!(r["parts"].as_array().unwrap().len(), 1);
    let view = e.laid_out_view().unwrap();
    assert_eq!(view.model.world_faces().len(), 12, "both plinth boards");
    inside_its_box(&view);
}

#[test]
fn the_view_stays_on_when_another_program_saves_the_model() {
    let dir = std::env::temp_dir().join(format!("sc-parts-view-reload-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let doc = dir.join("m.sketchcraft");
    let mut live = Live::open(doc.clone());
    for c in [
        json!({"cmd":"begin_group","name":"Board"}),
        json!({"cmd":"rect","from":[0,0,0],"to":[0.3,0.018,0]}),
    ] {
        assert_eq!(live.exec(&c)["ok"], true);
    }
    let f = live.engine.model.faces.keys().copied().max().unwrap();
    assert_eq!(live.exec(&json!({"cmd":"pushpull","face":f,"distance":1.2,"toward":[0,0,1]}))["ok"], true);
    assert_eq!(live.exec(&json!({"cmd":"end_group"}))["ok"], true);
    assert_eq!(live.exec(&json!({"cmd":"lay_out_parts","on":true}))["ok"], true);
    // another program (an agent) opens the same file, adds a board and saves
    std::thread::sleep(std::time::Duration::from_millis(1100));
    let mut other = Engine::new();
    run(&mut other, json!({"cmd":"open","path":doc}));
    board(&mut other, "Second", [1.0, 0.0, 0.0], [1.3, 0.018, 0.9]);
    run(&mut other, json!({"cmd":"save","path":doc}));
    assert!(live.sync(), "the save is read in");
    assert!(live.engine.laid_out.is_some(), "the person's view is theirs: another program's save does not switch it off");
    assert_eq!(live.scene()["laid_out"]["parts"].as_array().unwrap().len(), 2, "and it shows the new board");
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn the_model_pictures_are_made_from_is_the_laid_out_one_while_it_is_on() {
    // render, photoreal, animate and the agents' render all draw `shown_model` (read in rendering.rs, media.rs, mcp.rs);
    // this checks what it returns, not a photoreal picture or a video
    let mut e = Engine::new();
    cabinet(&mut e);
    let laid_target = {
        run(&mut e, json!({"cmd":"lay_out_parts","on":true}));
        let v = e.laid_out_view().unwrap();
        DVec3::from(sketchcraft::render::camera_for(&v.model, &sketchcraft::render::RenderOpts::default()).target)
    };
    // the model every picture-making command draws while laid out
    let shown = e.shown_model();
    let t = DVec3::from(sketchcraft::render::camera_for(&shown, &sketchcraft::render::RenderOpts::default()).target);
    assert!((t - laid_target).length() < 1e-12);
    run(&mut e, json!({"cmd":"lay_out_parts","on":false}));
    assert_eq!(serde_json::to_string(&*e.shown_model()).unwrap(), serde_json::to_string(&e.model).unwrap());
}

#[test]
fn a_chosen_group_takes_the_components_inside_it_along() {
    let mut e = Engine::new();
    let (_, shelves) = cabinet(&mut e);
    // a frame: the two sides and one shelf placement grouped together
    let sides: Vec<u64> = e.model.groups.iter().filter(|(_, g)| g.name == "Side").map(|(id, _)| *id as u64).collect();
    let frame = run(&mut e, json!({"cmd":"group","ids":[sides[0], sides[1], shelves[0]],"name":"Frame"}))["group"].as_u64().unwrap();
    run(&mut e, json!({"cmd":"lay_out_parts","on":true,"ids":[frame]}));
    let view = e.laid_out_view().unwrap();
    // both sides and the shelf inside are drawn, the shelf moved with the frame (same distance from a side)
    let drawn = view.model.world_faces();
    assert_eq!(drawn.len(), 18, "two sides and the shelf");
    let before: Vec<DVec3> = e.model.world_faces().iter().filter(|f| f.owner as u64 == shelves[0]).flat_map(|f| f.outer.clone()).collect();
    let after: Vec<DVec3> = drawn.iter().filter(|f| f.owner as u64 == shelves[0]).flat_map(|f| f.outer.clone()).collect();
    assert_eq!(before.len(), after.len());
    let t = view.laid[0].transform;
    for (b, a) in before.iter().zip(&after) {
        assert!((t.transform_point3(*b) - *a).length() < 1e-9, "{b} -> {a}");
    }
}

#[test]
fn restoring_a_backup_waits_until_the_parts_are_no_longer_laid_out() {
    let dir = std::env::temp_dir().join(format!("sc-parts-view-restore-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut live = Live::open(dir.join("m.sketchcraft"));
    assert_eq!(live.exec(&json!({"cmd":"rect","from":[0,0,0],"to":[1,1,0]}))["ok"], true);
    assert_eq!(live.exec(&json!({"cmd":"lay_out_parts","on":true}))["ok"], true);
    let r = live.exec(&json!({"cmd":"restore_backup","name":"anything"}));
    assert_eq!(r["ok"], false, "{r}");
    assert_eq!(r["laid_out"], true, "{r}");
    std::fs::remove_dir_all(&dir).ok();
}
