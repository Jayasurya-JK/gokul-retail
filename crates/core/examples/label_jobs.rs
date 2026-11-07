//! Writes the prepared label jobs as FILES (nothing is sent to any printer) plus the element lists the preview PNGs are drawn from:
//! `calib-row.tspl` (the measuring alignment row), `calib-verify.tspl`, `tea-3up-v4.tspl` (3 x Tea Thool 100g) and `*.json`.
//!
//!   cargo run -p gokul-core --example label_jobs -- "<output folder>" [alignX alignY pitch]
use gokul_print::tspl::{self, Fields, Label, Spec};

fn main() {
    let dir = std::path::PathBuf::from(std::env::args().nth(1).expect("usage: label_jobs <output folder>"));
    std::fs::create_dir_all(&dir).unwrap();
    let mut spec = Spec::from_preset(tspl::preset("32x25-3up").unwrap());
    let nums: Vec<f64> = std::env::args().skip(2).filter_map(|a| a.parse().ok()).collect();
    if nums.len() == 3 {
        spec.align_x_mm = nums[0];
        spec.align_y_mm = nums[1];
        spec.pitch_adjust_mm = nums[2];
    }
    let w = |name: &str, bytes: &[u8]| std::fs::write(dir.join(name), bytes).unwrap();
    let fields = Fields { shop: true, name: true, mrp: false, price: true, barcode: true, dates: true, batch: false, net: false, legal: false, qr: true };
    let label = Label {
        shop: "GOKUL".into(),
        name: "Tea Thool 100g".into(),
        mrp: 3500,
        price: 3500,
        barcode: "8906005666918".into(),
        pack_date: "07/11/26".into(),
        best_before: String::new(),
        price_prefix: "Rs.".into(),
        ..Default::default()
    };
    w("tea-3up-v4.tspl", &tspl::render_job(&spec, &fields, &[label.clone(), label.clone(), label.clone()]));
    w("calib-row.tspl", &tspl::render_calibration_job(&spec, false));
    w("calib-verify.tspl", &tspl::render_calibration_job(&spec, true));
    let cells = |f: &dyn Fn(u32) -> Vec<tspl::El>| serde_json::to_string(&(0..3).map(f).collect::<Vec<_>>()).unwrap();
    w("tea-3up-v4.json", cells(&|_| tspl::layout_label(&spec, &fields, &label)).as_bytes());
    // calibration cells: [shift_x, shift_y, elements] per sticker
    let cal = |verify: bool| serde_json::to_string(&(0..3).map(|c| tspl::calibration_cell(&spec, c, verify)).collect::<Vec<_>>()).unwrap();
    w("calib-row.json", cal(false).as_bytes());
    w("calib-verify.json", cal(true).as_bytes());
}
