// Soften takes a group: "soften the box" when the box is a group softens the edges of every face inside it.
use serde_json::json;
use sketchcraft::live::Live;
use sketchcraft::Engine;

fn run(e: &mut Live, c: serde_json::Value) -> serde_json::Value {
    let r = e.exec(&c);
    assert_eq!(r["ok"], true, "{c} -> {r}");
    r
}

#[test]
fn soften_a_group_softens_every_face_inside_it() {
    let mut e = Live::memory(Engine::new());
    let id = run(&mut e, json!({"cmd": "begin_group", "name": "Box"}))["group"].clone();
    run(&mut e, json!({"cmd": "rect", "from": [0, 0, 0], "to": [2, 2, 0], "as": "b"}));
    run(&mut e, json!({"cmd": "pushpull", "face": "@b", "distance": 2, "toward": [0, 0, 1]}));
    run(&mut e, json!({"cmd": "end_group"}));
    let r = run(&mut e, json!({"cmd": "soften", "ids": [id]}));
    assert!(r["edges"].as_u64().unwrap() >= 12, "{r}");
    let edges = e.engine.model.edges.values().filter(|x| x.group.is_some());
    assert!(edges.clone().count() >= 12 && edges.clone().all(|x| x.soft));
}

#[test]
fn soften_still_refuses_what_isnt_geometry() {
    let mut e = Live::memory(Engine::new());
    let r = e.exec(&json!({"cmd": "soften", "ids": [999999]}));
    assert_eq!(r["ok"], false);
    assert!(r["error"].as_str().unwrap().contains("edge, face or group"), "{r}");
}
