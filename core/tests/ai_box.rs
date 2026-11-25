//! The SketchCraft AI box's run path (app/src-tauri/src/ai.rs, included here so it is tested without building the
//! desktop app): the model's commands run as an untrusted agent, anything off the allowlist is refused, and one
//! answer is one undo step.
#[path = "../../app/src-tauri/src/ai.rs"]
mod ai;

use serde_json::{json, Value};
use sketchcraft::live::Live;
use sketchcraft::Engine;

fn rows(r: &Value) -> Vec<(String, String)> {
    r["rows"].as_array().unwrap().iter().map(|x| (x["cmd"].as_str().unwrap().to_string(), x["status"].as_str().unwrap().to_string())).collect()
}
fn faces(live: &mut Live) -> (u64, usize) {
    let i = live.exec(&json!({"cmd": "info"}));
    (i["faces"].as_u64().unwrap(), i["materials"].as_array().map_or(0, |a| a.len()))
}

#[test]
fn an_answer_is_one_undo_and_refusals_are_shown() {
    let mut live = Live::memory(Engine::new());
    assert_eq!(ai::state(&mut live), "empty model");

    // answer 1: a box in a group (4 commands, ONE undo step)
    let a1 = json!([{"cmd":"begin_group","name":"box","as":"box"},{"cmd":"rect","from":[0,0,0],"to":[4,3,0],"as":"f"},{"cmd":"pushpull","face":"@f","distance":2.5,"toward":[0,0,1]},{"cmd":"end_group"}]);
    let r = ai::apply(&mut live, &a1);
    assert_eq!(r["ok"], true, "{r}");
    assert!(rows(&r).iter().all(|(_, s)| s == "ok"), "{r}");
    assert_eq!(faces(&mut live).0, 6);
    let st = ai::state(&mut live);
    assert!(st.contains("@box is a group named \"box\": 4 m (x) by 3 m (y) by 2.5 m tall"), "{st}");

    // answer 2: paint it red (names from the state resolve)
    let r = ai::apply(&mut live, &json!([{"cmd":"paint","ids":["@box"],"color":[1,0,0]}]));
    assert_eq!(rows(&r), vec![("paint".into(), "ok".into())], "{r}");

    // answer 3: a question
    let r = ai::apply(&mut live, &json!([{"cmd":"volume","id":"@box"}]));
    assert_eq!(r["rows"][0]["status"], "ok", "{r}");
    let v = r["rows"][0]["reply"]["volume"].as_f64().unwrap_or(0.0);
    assert!((v - 30.0).abs() < 0.01, "volume {r}");
    assert_eq!(r["changed"], false);

    // answer 4: things outside the allowlist are refused, never run; the allowed one still runs
    let evil = json!([{"cmd":"save","path":"/tmp/sketchcraft-ai-should-not-exist.sketchcraft"},{"cmd":"export_obj","path":"/tmp/x.obj"},{"cmd":"plugins"},{"cmd":"undo"},{"cmd":"begin_batch"},{"cmd":"info"},"rm -rf /",{"nocmd":1}]);
    let r = ai::apply(&mut live, &evil);
    let got = rows(&r);
    assert_eq!(got[0].1, "refused");
    assert_eq!(got[1].1, "refused");
    assert_eq!(got[2].1, "refused");
    assert_eq!(got[3].1, "refused");
    assert_eq!(got[4].1, "refused");
    assert_eq!(got[5].1, "ok");
    assert_eq!(got[6].1, "refused");
    assert_eq!(got[7].1, "refused");
    assert!(!std::path::Path::new("/tmp/sketchcraft-ai-should-not-exist.sketchcraft").exists());

    // one Undo takes back the whole paint answer, not more
    let r = live.exec(&json!({"cmd": "undo"}));
    assert_eq!(r["ok"], true, "{r}");
    // (the questions changed nothing, so the paint was the last step)
    let i = live.exec(&json!({"cmd": "faces"}));
    assert!(i["faces"].as_array().unwrap().iter().all(|f| f["material"].is_null()), "paint should be undone: {i}");
    assert_eq!(faces(&mut live).0, 6, "the box must still be there");
    // and one more Undo takes back the whole box answer (4 commands)
    let r = live.exec(&json!({"cmd": "undo"}));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(faces(&mut live).0, 0, "the whole box answer is one undo step");
}

#[test]
fn a_failing_command_stops_the_answer_but_keeps_one_step() {
    let mut live = Live::memory(Engine::new());
    let r = ai::apply(&mut live, &json!([{"cmd":"rect","from":[0,0,0],"to":[2,2,0],"as":"a"},{"cmd":"pushpull","face":"@nope","distance":1},{"cmd":"rect","from":[5,5,0],"to":[6,6,0]}]));
    let got = rows(&r);
    assert_eq!((got[0].1.as_str(), got[1].1.as_str(), got[2].1.as_str()), ("ok", "error", "skipped"), "{r}");
    let r = live.exec(&json!({"cmd": "undo"}));
    assert_eq!(r["ok"], true);
    assert_eq!(faces(&mut live).0, 0);
}
