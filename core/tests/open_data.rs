// `open` from a model's contents (the app's bundled examples), checked the same way as a file.
use serde_json::json;
use sketchcraft::live::Live;
use sketchcraft::Engine;

const TOWNHOUSE: &str = include_str!("../../examples/townhouse_fixtures.sketchcraft");

#[test]
fn the_townhouse_example_opens_from_its_data() {
    let mut live = Live::memory(Engine::new());
    let r = live.exec(&json!({"cmd": "open", "data": TOWNHOUSE}));
    assert_eq!(r["ok"], true, "{r}");
    assert_eq!(r["faces"], 441);
    assert!(r["path"].is_null(), "an example has no file: {r}");
    assert_eq!(live.engine.model.instances.len(), 14, "the fixtures");
    assert!(live.engine.model.groups.values().any(|g| g.name == "Second floor"));
    assert!(live.engine.read_only.is_none(), "saved in this format, it opens for editing");
}

#[test]
fn open_wants_a_path_or_data_and_checks_data_like_a_file() {
    let mut live = Live::memory(Engine::new());
    assert_eq!(live.exec(&json!({"cmd": "open"}))["ok"], false);
    assert_eq!(live.exec(&json!({"cmd": "open", "path": "x.sketchcraft", "data": "{}"}))["ok"], false);
    let bad = live.exec(&json!({"cmd": "open", "data": "not a model"}));
    assert_eq!(bad["ok"], false);
    assert!(bad["error"].as_str().unwrap().contains("isn't a model SketchCraft can read"), "{bad}");
}
