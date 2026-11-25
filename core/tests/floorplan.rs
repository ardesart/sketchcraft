//! floorplan_build: a compact plan expanded into walls, openings, rooms and floors, deterministically.
use serde_json::{json, Value};
use sketchcraft::policy::{Caller, Workspace};
use sketchcraft::Engine;

fn run(e: &mut Engine, v: Value) -> Value {
    let r = e.exec_json(&v.to_string());
    assert_eq!(r["ok"], true, "{v} -> {r}");
    r
}

fn err(e: &mut Engine, v: Value) -> String {
    let r = e.exec_json(&v.to_string());
    assert_ne!(r["ok"], true, "{v} should fail");
    r["error"].as_str().unwrap_or_default().to_string()
}

fn faces(e: &mut Engine) -> Vec<Value> {
    run(e, json!({"cmd": "faces"}))["faces"].as_array().unwrap().clone()
}

fn near(a: f64, b: f64) -> bool {
    (a - b).abs() < 1e-3
}

/// Living 5x4 and Kitchen 3x4 side by side, a Hall 8x2 across the back.
fn house() -> Value {
    json!({"cmd": "floorplan_build", "floors": [{"rooms": [
        {"name": "Living", "rect": [0, 0, 5, 4]}, {"name": "Kitchen", "rect": [5, 0, 3, 4]}, {"name": "Hall", "rect": [0, 4, 8, 2]}],
        "openings": [
            {"kind": "door", "between": ["Living", "Kitchen"]},
            {"kind": "window", "between": ["Living", "outside"], "side": "south"},
            {"kind": "door", "between": ["Hall", "outside"], "side": "west"},
            {"kind": "opening", "between": ["Hall", "Living"]},
            {"kind": "window", "between": ["Kitchen", "outside"], "side": "east"}]}]})
}

#[test]
fn shared_walls_are_built_once() {
    let mut e = Engine::new();
    let r = run(&mut e, json!({"cmd": "floorplan_build", "floors": [{"rooms": [{"name": "A", "rect": [0, 0, 4, 3]}, {"name": "B", "rect": [4, 0, 3, 3]}]}]}));
    let fl = &r["floors"][0];
    let walls = fl["walls"].as_i64().unwrap();
    // the wall tops: one ring of 0.2 m walls round 7x3 with ONE wall at x=4 (not two)
    let tops: Vec<Value> = faces(&mut e).into_iter().filter(|f| f["group"] == walls && near(f["center"][2].as_f64().unwrap(), 2.7)).collect();
    let area: f64 = tops.iter().map(|f| f["area"].as_f64().unwrap()).sum();
    assert!(near(area, 7.2 * 3.2 - 3.8 * 2.8 - 2.8 * 2.8), "wall top area {area}");
    let v = run(&mut e, json!({"cmd": "volume", "id": walls}));
    assert!(near(v["volume"].as_f64().unwrap(), area * 2.7), "{v}");
    // each room is a group named after it with its floor area inside the walls
    assert_eq!(fl["rooms"][0]["name"], "A");
    assert!(near(fl["rooms"][0]["area"].as_f64().unwrap(), 3.8 * 2.8));
    let info = run(&mut e, json!({"cmd": "info"}));
    let names: Vec<&str> = info["groups"].as_array().unwrap().iter().map(|g| g["name"].as_str().unwrap()).collect();
    assert!(names.contains(&"A") && names.contains(&"B") && names.contains(&"Walls"), "{names:?}");
    assert_eq!(info["tags"]["Walls"], true);
    assert_eq!(info["tags"]["Rooms"], true);
}

#[test]
fn openings_go_through_the_right_wall() {
    let mut e = Engine::new();
    let r = run(&mut e, house());
    let ops = r["floors"][0]["openings"].as_array().unwrap();
    // the Living/Kitchen door sits on their shared wall x=5, centered on it, on the floor
    assert_eq!(ops[0]["at"], json!([5.0, 2.0, 0.0]));
    // the window on the Living's south wall at sill 0.9; the Hall door on the west wall
    assert_eq!(ops[1]["at"], json!([2.5, 0.0, 0.9]));
    assert_eq!(ops[2]["at"], json!([0.0, 5.0, 0.0]));
    assert_eq!(ops[4]["at"], json!([8.0, 2.0, 0.9]));
    let walls = r["floors"][0]["walls"].as_i64().unwrap();
    let fs = faces(&mut e);
    // the door's head (underside of the lintel) is a 0.9 x 0.2 face at 2.1 m on x=5
    assert!(fs.iter().any(|f| f["group"] == walls && f["normal"][2].as_f64().unwrap() < -0.9 && near(f["center"][0].as_f64().unwrap(), 5.0) && near(f["center"][2].as_f64().unwrap(), 2.1) && near(f["area"].as_f64().unwrap(), 0.18)));
    // the openings go right through: the walls are still one closed solid, minus each opening
    let top: f64 = fs.iter().filter(|f| f["group"] == walls && near(f["center"][2].as_f64().unwrap(), 2.7)).map(|f| f["area"].as_f64().unwrap()).sum();
    let holes = 0.2 * (0.9 * 2.1 + 1.2 * 1.2 + 0.9 * 2.1 + 1.2 * 2.1 + 1.2 * 1.2);
    let v = run(&mut e, json!({"cmd": "volume", "id": walls}));
    assert!(near(v["volume"].as_f64().unwrap(), top * 2.7 - holes), "{v} vs {}", top * 2.7 - holes);
}

#[test]
fn two_floors_stack() {
    let mut e = Engine::new();
    let r = run(&mut e, json!({"cmd": "floorplan_build", "wall_height": 3.0, "floors": [
        {"level": 1, "rooms": [{"name": "Garage", "rect": [0, 0, 6, 6]}], "openings": [{"kind": "door", "between": ["Garage", "outside"], "side": "south", "width": 2.4}],
         "stairs": [{"at": [1, 1], "direction": "north"}]},
        {"level": 2, "rooms": [{"name": "Bed", "rect": [0, 0, 6, 6]}], "openings": [{"kind": "window", "between": ["Bed"], "side": "north"}]}]}));
    assert_eq!(r["floors"][1]["elevation"], 3.0);
    assert_eq!(r["floors"][1]["openings"][0]["at"], json!([3.0, 6.0, 3.9]));
    assert_eq!(r["floors"][0]["stairs"][0]["rise"], 3.0);
    let info = run(&mut e, json!({"cmd": "info"}));
    assert!(near(info["bounds"]["max"][2].as_f64().unwrap(), 6.0), "{}", info["bounds"]);
    assert_eq!(r["rooms"], 2);
}

#[test]
fn bad_plans_say_what_is_wrong() {
    let mut e = Engine::new();
    let fp = |rooms: Value, openings: Value| json!({"cmd": "floorplan_build", "floors": [{"rooms": rooms, "openings": openings}]});
    let two = json!([{"name": "A", "rect": [0, 0, 3, 3]}, {"name": "B", "rect": [3, 0, 3, 3]}]);
    assert!(err(&mut e, fp(json!([{"name": "A", "rect": [0, 0, 3, 3]}, {"name": "B", "rect": [2, 0, 3, 3]}]), json!([]))).contains("overlap"));
    assert!(err(&mut e, fp(two.clone(), json!([{"between": ["A", "Garage"]}]))).contains("no room named \"Garage\""));
    assert!(err(&mut e, fp(two.clone(), json!([{"between": ["A", "B"], "side": "north"}]))).contains("only on its east side"));
    assert!(err(&mut e, fp(two.clone(), json!([{"between": ["A", "B"], "width": 3.5}]))).contains("does not fit"));
    assert!(err(&mut e, fp(json!([{"name": "A", "rect": [0, 0, 3]}]), json!([]))).contains("floors[0].rooms[0].rect"));
    assert!(err(&mut e, fp(json!([{"name": "A", "polygon": [[0, 0], [3, 1], [3, 3], [0, 3]]}]), json!([]))).contains("diagonal"));
    assert!(err(&mut e, fp(two.clone(), json!([{"kind": "skylight", "between": ["A", "B"]}]))).contains("kind"));
    assert!(err(&mut e, fp(two, json!([{"between": ["A", "B"]}, {"between": ["B", "A"]}]))).contains("overlaps"));
    assert!(err(&mut e, json!({"cmd": "floorplan_build", "floors": []})).contains("floors"));
    // nothing was built by any of them
    assert_eq!(faces(&mut e).len(), 0);
}

#[test]
fn one_undo_takes_it_all_back_and_agents_may_run_it() {
    let mut e = Engine::new();
    run(&mut e, json!({"cmd": "rect", "from": [20, 0, 0], "to": [21, 1, 0]}));
    let before = faces(&mut e).len();
    run(&mut e, house());
    assert!(faces(&mut e).len() > before + 20);
    run(&mut e, json!({"cmd": "undo"}));
    assert_eq!(faces(&mut e).len(), before);
    // the untrusted agent policy allows it (a model edit), and so does a plugin
    let agent = Caller::Mcp(Workspace::anywhere());
    assert!(sketchcraft::policy::permits(&agent, "floorplan_build"));
    assert!(sketchcraft::policy::permits(&Caller::Plugin, "floorplan_build"));
    let r = e.exec_json_as(&agent, &house().to_string());
    assert_eq!(r["ok"], true, "{r}");
}

#[test]
fn same_plan_same_model() {
    let build = || {
        let mut e = Engine::new();
        run(&mut e, house());
        let mut f: Vec<String> = faces(&mut e).iter().map(|f| format!("{:.3} {:.3} {}", f["area"].as_f64().unwrap(), f["center"][2].as_f64().unwrap(), f["normal"])).collect();
        f.sort();
        f
    };
    assert_eq!(build(), build());
}

#[test]
fn open_edges_have_no_wall_and_stairwells_no_floor() {
    let mut e = Engine::new();
    let plan = |kind: &str| json!({"cmd": "floorplan_build", "floors": [{"rooms": [{"name": "Kitchen", "rect": [0, 0, 3, 4]}, {"name": "Living", "rect": [3, 0, 5, 4]}, {"name": "Stair", "rect": [8, 0, 1, 4], "floor": false}],
        "openings": [{"kind": kind, "between": ["Kitchen", "Living"]}]}]});
    let top = |e: &mut Engine, r: &Value| -> f64 {
        let w = r["floors"][0]["walls"].as_i64().unwrap();
        faces(e).iter().filter(|f| f["group"] == w && near(f["center"][2].as_f64().unwrap(), 2.7)).map(|f| f["area"].as_f64().unwrap()).sum()
    };
    let walled = run(&mut e, plan("door"));
    let with_wall = top(&mut e, &walled);
    run(&mut e, json!({"cmd": "undo"}));
    let open = run(&mut e, plan("open"));
    assert_eq!(open["floors"][0]["openings"][0]["kind"], "open");
    // the x=3 wall (3.8 m clear between the end walls) is gone
    assert!(near(with_wall - top(&mut e, &open), 0.2 * 3.8), "{with_wall} vs {}", top(&mut e, &open));
    // the stairwell room is a group with no floor face
    let stair = open["floors"][0]["rooms"][2]["group"].as_i64().unwrap();
    assert!(!faces(&mut e).iter().any(|f| f["group"] == stair));
}

#[test]
fn feet_and_a_stair_fitted_into_its_room() {
    let mut e = Engine::new();
    let r = run(&mut e, json!({"cmd": "floorplan_build", "units": "ft", "wall_height": 9, "floors": [
        {"rooms": [{"name": "Living", "rect": [0, 0, 16, 14]}, {"name": "Stairs", "rect": [16, 0, 4, 14]}], "openings": [{"kind": "open", "between": ["Living", "Stairs"]}], "stairs": [{"room": "Stairs"}]},
        {"rooms": [{"name": "Bedroom", "rect": [0, 0, 16, 14]}, {"name": "Stairs", "rect": [16, 0, 4, 14]}], "openings": [{"kind": "door", "between": ["Bedroom", "Stairs"], "width": 2.5}]}]}));
    // 16 x 14 ft = 20.81 m² between centerlines; the upper floor starts at 9 ft
    assert!(near(r["floors"][0]["rooms"][0]["gross_area"].as_f64().unwrap(), 16.0 * 14.0 * 0.3048 * 0.3048));
    assert!(near(r["floors"][1]["elevation"].as_f64().unwrap(), 9.0 * 0.3048));
    assert!(near(r["floors"][1]["openings"][0]["width"].as_f64().unwrap(), 2.5 * 0.3048));
    // the stair climbs the whole floor height inside the Stairs room, and upstairs the Stairs room is a stairwell
    assert!(near(r["floors"][0]["stairs"][0]["rise"].as_f64().unwrap(), 9.0 * 0.3048));
    let stair = r["floors"][0]["stairs"][0]["group"].as_i64().unwrap();
    let parts = run(&mut e, json!({"cmd": "parts", "ids": [stair]}));
    let size: Vec<f64> = parts["parts"][0]["size"].as_array().unwrap().iter().map(|v| v.as_f64().unwrap()).collect();
    assert!(size[0] <= 14.0 * 0.3048 - 0.2 + 1e-6, "{parts}");
    let well = r["floors"][1]["rooms"][1]["group"].as_i64().unwrap();
    assert!(!faces(&mut e).iter().any(|f| f["group"] == well));
    // a room too short for the stair says how much run it needs
    let short = err(&mut e, json!({"cmd": "floorplan_build", "floors": [{"rooms": [{"name": "S", "rect": [0, 0, 1.2, 2]}], "stairs": [{"room": "S"}]}, {"rooms": [{"name": "S", "rect": [0, 0, 1.2, 2]}]}]}));
    assert!(short.contains("needs about"), "{short}");
}

#[test]
fn an_opening_as_wide_as_the_clear_wall_is_refused_cleanly() {
    // found by gen_plans: a 1.2 m opening in a 1.4 m wall (1.2 m clear) used to panic in the cut
    let mut e = Engine::new();
    let r = e.exec_json(&json!({"cmd": "floorplan_build", "units": "cm", "floors": [{"rooms": [{"name": "Den", "rect": [0, 550, 370, 490]}, {"name": "Hall", "rect": [0, 1040, 140, 390]}, {"name": "Kitchen", "rect": [140, 1040, 230, 390]}],
        "openings": [{"kind": "opening", "between": ["Den", "Hall"]}]}]}).to_string());
    assert!(r["error"].as_str().unwrap_or_default().contains("does not fit"), "{r}");
    assert_eq!(faces(&mut e).len(), 0);
}

#[test]
fn room_info_finds_rooms_loosely_and_does_the_maths() {
    let mut e = Engine::new();
    run(&mut e, json!({"cmd": "floorplan_build", "units": "ft", "floors": [{"rooms": [
        {"name": "Primary Bedroom", "rect": [0, 0, 13, 13]}, {"name": "Bedroom 2", "rect": [13, 0, 12, 13]}, {"name": "Kitchen / Living / Dining", "rect": [0, 13, 25, 15]}]}]}));
    let before = faces(&mut e).len();
    let m = run(&mut e, json!({"cmd": "room_info", "name": "master"}));
    assert_eq!(m["room"], "Primary Bedroom");
    assert!(near(m["area_ft2"].as_f64().unwrap(), 169.0), "{m}");
    assert!((m["area_m2"].as_f64().unwrap() - 169.0 * 0.3048 * 0.3048).abs() < 0.01); // corners snap to the mm
    assert!(near(m["perimeter_ft"].as_f64().unwrap(), 52.0));
    assert_eq!(m["level"], "Level 1");
    assert_eq!(run(&mut e, json!({"cmd": "room_info", "name": "bed 2"}))["room"], "Bedroom 2");
    assert_eq!(run(&mut e, json!({"cmd": "room_info", "name": "owner's bedroom"}))["room"], "Primary Bedroom");
    assert_eq!(run(&mut e, json!({"cmd": "room_info", "name": "Master Bedroom"}))["room"], "Primary Bedroom");
    assert_eq!(run(&mut e, json!({"cmd": "room_info", "name": "the kitchen"}))["room"], "Kitchen / Living / Dining");
    // ambiguous: say which ones; unknown: list the rooms
    assert!(err(&mut e, json!({"cmd": "room_info", "name": "bedroom"})).contains("Primary Bedroom, Bedroom 2") || err(&mut e, json!({"cmd": "room_info", "name": "bedroom"})).contains("Bedroom 2, Primary Bedroom"));
    assert!(err(&mut e, json!({"cmd": "room_info", "name": "garage"})).contains("rooms:"));
    // read-only, and the agent may ask
    assert_eq!(faces(&mut e).len(), before);
    let agent = sketchcraft::policy::Caller::Mcp(sketchcraft::policy::Workspace::anywhere());
    assert!(sketchcraft::policy::permits(&agent, "room_info"));
}
