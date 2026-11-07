//! One-time: makes the Gokul 3-up (33 x 25 mm, three across) the saved label size when the shop still has the old
//! "gokul-small" size saved. It changes only the label size keys of the printer settings, through the app's own
//! settings API (`save_settings_bundle`). Nothing is printed. Other settings are left as they are.
//!
//!   cargo run -p gokul-core --example apply_label_default -- "<path to gokul.db>"
use serde_json::json;

fn main() {
    let path = std::env::args().nth(1).expect("usage: apply_label_default <path to gokul.db>");
    let db = gokul_core::Db::open(std::path::Path::new(&path)).expect("open database");
    let out = db
        .with(|c| {
            let mut b = gokul_core::crm::get_settings_bundle(c)?;
            if b["printers"]["labelPreset"] != "gokul-small" {
                return Ok(json!({ "changed": false, "labelPreset": b["printers"]["labelPreset"] }));
            }
            let p = &mut b["printers"];
            p["labelPreset"] = json!("32x25-3up");
            p["labelWidth"] = json!(33);
            p["labelHeight"] = json!(25);
            p["labelGap"] = json!(3);
            p["labelColumns"] = json!(3);
            p["labelColGap"] = json!(2);
            if let Some(o) = p.as_object_mut() {
                o.remove("detected");
            }
            let saved = gokul_core::crm::save_settings_bundle(c, &b)?;
            Ok(json!({ "changed": true, "labelPreset": saved["printers"]["labelPreset"], "labelWidth": saved["printers"]["labelWidth"], "labelColumns": saved["printers"]["labelColumns"] }))
        })
        .expect("read or save settings");
    println!("{out}");
}
