// The desktop program: everything is in lib.rs, which the Android build also uses.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    sketchcraft_app_lib::run()
}
