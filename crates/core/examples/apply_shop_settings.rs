//! One-time: puts the shop's details from the owner's current bill into Settings through the app's own settings API
//! (`save_settings_bundle`: validated, audited, one transaction). It changes only the keys below; stock, bills and everything
//! else stay as they are. Close Gokul POS and Gokul Office first.
//!
//!   cargo run -p gokul-core --example apply_shop_settings -- "<path to gokul.db>"
use serde_json::json;

fn main() {
    let path = std::env::args().nth(1).expect("usage: apply_shop_settings <path to gokul.db>");
    let db = gokul_core::Db::open(std::path::Path::new(&path)).expect("open database");
    let saved = db
        .with(|c| {
            let mut b = gokul_core::crm::get_settings_bundle(c)?;
            b["shop"]["name"] = json!("SRI GOKUL ENTERPRISES");
            b["shop"]["shortName"] = json!("GOKUL");
            b["shop"]["tagline"] = json!("வாகை மரச்செக்கு எண்ணெய்");
            b["shop"]["address"] = json!("No: 30, Nellikuppam Main Road, Kondur, Cuddalore - 607006.");
            b["shop"]["city"] = json!("");
            b["shop"]["pincode"] = json!("");
            b["shop"]["gstin"] = json!("33EAEPK8839P2ZX");
            b["shop"]["phone"] = json!("9445099191");
            b["shop"]["whatsapp"] = json!("9445099191");
            b["billFormat"]["footer"] = json!("Save Your Health, With Our Natural Product !");
            b["billFormat"]["footerTamil"] = json!("இயற்கை உணவோடு வாழுங்கள்");
            if let Some(o) = b["printers"].as_object_mut() {
                o.remove("detected");
            }
            gokul_core::crm::save_settings_bundle(c, &b)
        })
        .expect("save settings");
    println!("shop: {}", saved["shop"]);
    println!("footer: {} / {}", saved["billFormat"]["footer"], saved["billFormat"]["footerTamil"]);
}
