//! Barcode stickers: builds the label for each picked item from the saved records and sends the TSPL job to the label
//! printer (TSC TE244 and friends). Nothing here writes to the database.
//!
//! The database lock is held only while the labels are built; the spooler call happens after it is released, exactly like
//! bill printing. A problem is an answer `{ ok: false, message }`, never an error.
//!
//! Settings live in `bundle.printers` (label printer name, preset or custom size, darkness, speed, offsets, flip) and can
//! be overridden per call through `opts` (the Settings screen tests unsaved values; the Labels page picks its own size).

use crate::catalog;
use crate::db::Db;
use crate::error::Result;
use crate::printing::{auto_label_printer, load_config, Config};
use crate::types::Item;
use chrono::{Local, Months, NaiveDate};
use gokul_print::tspl::{self, El, Fields, Label, Spec};
use serde_json::{json, Value};

const MAX_LABELS: usize = 3000;

fn text(v: &Value) -> String {
    v.as_str().unwrap_or("").trim().to_string()
}

/// `opts[key]` when given, else the saved setting `label<Key>`.
fn pick(opts: &Value, set: &Value, key: &str) -> Value {
    if !opts[key].is_null() {
        return opts[key].clone();
    }
    let mut k = String::from("label");
    let mut ch = key.chars();
    if let Some(f) = ch.next() {
        k.extend(f.to_uppercase());
        k.push_str(ch.as_str());
    }
    set[k.as_str()].clone()
}

/// The roll and printer tuning for this call.
pub fn spec_from(set: &Value, opts: &Value) -> std::result::Result<Spec, String> {
    let preset_id = pick(opts, set, "preset").as_str().unwrap_or("50x25").to_string();
    let num = |k: &str, d: f64| pick(opts, set, k).as_f64().unwrap_or(d);
    let mut spec = match tspl::preset(&preset_id) {
        Some(p) => Spec::from_preset(p),
        None => Spec {
            width: num("width", 50.0),
            height: num("height", 25.0),
            gap: num("gap", 3.0),
            columns: num("columns", 1.0).clamp(1.0, 6.0) as u32,
            col_gap: num("colGap", 0.0),
            ..Spec::from_preset(&tspl::PRESETS[0])
        },
    };
    spec.darkness = num("darkness", 8.0).clamp(0.0, 15.0) as u8;
    spec.speed = num("speed", 4.0).clamp(1.0, 8.0) as u8;
    spec.dx = num("offsetX", 0.0).clamp(-80.0, 80.0) as i32;
    spec.dy = num("offsetY", 0.0).clamp(-80.0, 80.0) as i32;
    spec.start_mm = num("startMm", 0.0).clamp(0.0, 5.0);
    spec.flip = pick(opts, set, "flip").as_bool().unwrap_or(false);
    spec.ribbon = pick(opts, set, "ribbon").as_bool().unwrap_or(true);
    spec.rupee = match pick(opts, set, "rupee").as_str() {
        Some("symbol") => tspl::Rupee::Symbol,
        Some("text") => tspl::Rupee::Text,
        _ => tspl::Rupee::Both,
    };
    spec.validate()?;
    Ok(spec)
}

fn fields_from(opts: &Value) -> Fields {
    let mut f = Fields::default();
    let o = &opts["fields"];
    let set = |k: &str, slot: &mut bool| {
        if let Some(b) = o[k].as_bool() {
            *slot = b;
        }
    };
    set("shop", &mut f.shop);
    set("name", &mut f.name);
    set("mrp", &mut f.mrp);
    set("price", &mut f.price);
    set("barcode", &mut f.barcode);
    set("dates", &mut f.dates);
    set("batch", &mut f.batch);
    set("net", &mut f.net);
    set("legal", &mut f.legal);
    set("qr", &mut f.qr);
    f
}

/// How long the item keeps: oils and ghee 6 months, jaggery 4, everything else 9 (the owner can override per print).
fn default_months(item: &Item) -> u32 {
    match item.category_id.as_str() {
        "oil" | "ghee" => 6,
        "jag" => 4,
        _ => 9,
    }
}

fn legal_line(c: &Config) -> String {
    let mut s = String::from("Incl. of all taxes. Mfd & Pkd by ");
    s.push_str(&c.shop_name);
    if !c.address.trim().is_empty() {
        s.push_str(", ");
        s.push_str(c.address.trim());
    }
    s.push('.');
    if !c.fssai.is_empty() {
        s.push_str(&format!(" FSSAI {}", c.fssai));
    }
    s
}

/// The values printed on one item's sticker.
pub fn label_for(item: &Item, c: &Config, opts: &Value, today: NaiveDate, price_prefix: &str, blank_dates: bool) -> Label {
    // the Gokul sticker leaves Pkd and Exp blank (written by hand) unless a pack date was typed in: no date is ever invented
    let typed = opts["packDate"].as_str().and_then(|d| NaiveDate::parse_from_str(d, "%Y-%m-%d").ok());
    let dates_off = blank_dates && typed.is_none();
    let packed = typed.unwrap_or(today);
    let months = opts["bestBeforeMonths"].as_u64().map(|m| m as u32).unwrap_or_else(|| default_months(item));
    let bb = if months == 0 { None } else { packed.checked_add_months(Months::new(months)) };
    let batch = {
        let given = text(&opts["batch"]);
        if given.is_empty() {
            let initial = item.category_id.chars().next().map(|c| c.to_ascii_uppercase()).unwrap_or('X');
            format!("GK{}{}", packed.format("%y%m"), initial)
        } else {
            given
        }
    };
    let per = if item.loose {
        match item.unit.as_str() {
            "kg" => "/kg".to_string(),
            "l" => "/L".to_string(),
            u => format!("/{u}"),
        }
    } else {
        String::new()
    };
    Label {
        shop: if c.short_name.is_empty() { c.shop_name.clone() } else { c.short_name.clone() },
        name: item.name.clone(),
        mrp: if item.mrp > 0 { item.mrp } else { item.price },
        price: item.price,
        per,
        barcode: item.barcode.clone(),
        code: item.code.clone(),
        pack_date: if dates_off { String::new() } else { packed.format("%d/%m/%y").to_string() },
        best_before: if dates_off { String::new() } else { bb.map(|d| d.format("%d/%m/%y").to_string()).unwrap_or_default() },
        batch,
        net_qty: if item.loose { String::new() } else { item.pack_size.clone().unwrap_or_default() },
        legal: legal_line(c),
        price_prefix: price_prefix.to_string(),
    }
}

struct Built {
    spec: Spec,
    fields: Fields,
    printer: String,
    labels: Vec<(String, Label)>,
}

fn build(conn: &rusqlite::Connection, entries: &[(String, usize)], opts: &Value) -> Result<std::result::Result<Built, String>> {
    let c = load_config(conn)?;
    let b = crate::crm::get_settings_bundle(conn)?;
    let set = &b["printers"];
    let spec = match spec_from(set, opts) {
        Ok(s) => s,
        Err(e) => return Ok(Err(e)),
    };
    let printer = {
        let given = text(&opts["printer"]);
        if !given.is_empty() {
            given
        } else {
            text(&set["labelPrinter"])
        }
    };
    let today = Local::now().date_naive();
    let prefix = { let p = text(&set["labelPricePrefix"]); if p.is_empty() { "Rs.".to_string() } else { p } };
    let mut labels = Vec::new();
    for (id, copies) in entries {
        let Some(item) = catalog::get_item(conn, id)? else { continue };
        let l = label_for(&item, &c, opts, today, &prefix, spec.is_gokul());
        for _ in 0..(*copies).clamp(1, 999) {
            labels.push((item.id.clone(), l.clone()));
        }
    }
    Ok(Ok(Built { spec, fields: fields_from(opts), printer, labels }))
}

fn result(ok: bool, message: impl Into<String>) -> Value {
    json!({ "ok": ok, "message": message.into() })
}

fn entries_from(v: &Value) -> Vec<(String, usize)> {
    v.as_array()
        .map(|a| a.iter().filter_map(|e| Some((e["itemId"].as_str()?.to_string(), e["copies"].as_u64().unwrap_or(1) as usize))).collect())
        .unwrap_or_default()
}

fn spec_json(spec: &Spec) -> Value {
    json!({ "widthMm": spec.width, "heightMm": spec.height, "gapMm": spec.gap, "columns": spec.columns, "colGapMm": spec.col_gap,
            "cellW": spec.cell_w(), "cellH": spec.cell_h(), "colGapDots": tspl::dots(spec.col_gap) })
}

/// `labelPreview(itemIds, opts)`: the exact elements the printer will draw for each item (dots, 203 dpi).
pub fn label_preview(db: &Db, ids: &[String], opts: &Value) -> Value {
    let entries: Vec<(String, usize)> = ids.iter().map(|i| (i.clone(), 1)).collect();
    let built = db.with(|conn| build(conn, &entries, opts));
    match built {
        Ok(Ok(b)) => {
            let labels: Vec<Value> = b
                .labels
                .iter()
                .map(|(id, l)| json!({ "itemId": id, "elements": tspl::layout_label(&b.spec, &b.fields, l) }))
                .collect();
            json!({ "ok": true, "message": "", "spec": spec_json(&b.spec), "labels": labels })
        }
        Ok(Err(m)) => json!({ "ok": false, "message": m, "spec": Value::Null, "labels": [] }),
        Err(e) => json!({ "ok": false, "message": e.to_string(), "spec": Value::Null, "labels": [] }),
    }
}

fn send(printer: &str, title: &str, bytes: &[u8]) -> std::result::Result<String, String> {
    let target = if printer.trim().is_empty() { auto_label_printer().unwrap_or_default() } else { printer.to_string() };
    if target.is_empty() {
        return Err("no label printer is chosen. Pick one in Gokul Office, Settings, Printers".into());
    }
    gokul_print::send_raw(&target, title, bytes)?;
    Ok(target)
}

/// `printLabels(entries, opts)`: entries are `{ itemId, copies }`. Real TSPL job to the label printer.
pub fn print_labels(db: &Db, entries: &Value, opts: &Value) -> Value {
    let entries = entries_from(entries);
    if entries.is_empty() {
        return result(false, "Pick at least one item to print labels for.");
    }
    let built = db.with(|conn| build(conn, &entries, opts));
    let b = match built {
        Ok(Ok(b)) => b,
        Ok(Err(m)) => return result(false, m),
        Err(e) => return result(false, e.to_string()),
    };
    if b.labels.is_empty() {
        return result(false, "None of the picked items could be found.");
    }
    if b.labels.len() > MAX_LABELS {
        return result(false, format!("At most {MAX_LABELS} labels can be printed at once. Print in smaller batches."));
    }
    let flat: Vec<Label> = b.labels.iter().map(|(_, l)| l.clone()).collect();
    let bytes = tspl::render_job(&b.spec, &b.fields, &flat);
    match send(&b.printer, "Barcode labels", &bytes) {
        Ok(name) => {
            let rows = tspl::rows_needed(b.spec.columns, flat.len());
            result(true, format!("{} sent to {}{}.", plural(flat.len(), "label"), name, if b.spec.columns > 1 { format!(" ({rows} rows across {})", b.spec.columns) } else { String::new() }))
        }
        Err(e) => result(false, e),
    }
}

/// `testPrint('label', printer, opts)`: a calibration label (frame, ruler, centre cross, scannable code).
pub fn test_label(db: &Db, printer: &str, opts: &Value) -> Value {
    let loaded = db.with(|conn| {
        let b = crate::crm::get_settings_bundle(conn)?;
        Ok(b["printers"].clone())
    });
    let set = match loaded {
        Ok(s) => s,
        Err(e) => return result(false, e.to_string()),
    };
    let spec = match spec_from(&set, opts) {
        Ok(s) => s,
        Err(e) => return result(false, format!("Test print failed: {e}.")),
    };
    let name = if printer.trim().is_empty() { text(&set["labelPrinter"]) } else { printer.trim().to_string() };
    match send(&name, "Label test", &tspl::render_test_job(&spec)) {
        Ok(n) => result(true, format!("Test label sent to {n}. If it came out, check the frame sits on the sticker edge and scan the code. If it is shifted, use the offsets.")),
        Err(e) => result(false, format!("Test print failed: {e}.")),
    }
}

fn plural(n: usize, w: &str) -> String {
    format!("{n} {w}{}", if n == 1 { "" } else { "s" })
}

/// For tests: the elements of one label without a database.
pub fn elements(spec: &Spec, f: &Fields, l: &Label) -> Vec<El> {
    tspl::layout_label(spec, f, l)
}
