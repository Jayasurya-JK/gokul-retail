//! Shop settings: allow-listed keys, validation, load and save (spec 00 step 3 and
//! `docs/design/00-shells-and-login.md` section 6). Only keys in this file can be written.

use crate::audit::{self, event, AppKind, Detail};
use crate::error::{Error, FieldError, Result};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

pub const KEY_SETUP_COMPLETE: &str = "setup_complete";
pub const KEY_SHOP_NAME: &str = "shop_name";
pub const KEY_ADDRESS1: &str = "shop_address1";
pub const KEY_ADDRESS2: &str = "shop_address2";
pub const KEY_ADDRESS3: &str = "shop_address3";
pub const KEY_PHONE: &str = "shop_phone";
pub const KEY_GSTIN: &str = "shop_gstin";
pub const KEY_FSSAI: &str = "shop_fssai";
pub const KEY_BILL_FOOTER: &str = "bill_footer";
pub const KEY_IDLE_POS: &str = "idle_lock_secs_pos";
pub const KEY_IDLE_OFFICE: &str = "idle_lock_secs_office";
pub const KEY_OWNER_RECOVERY_HASH: &str = "owner_recovery_hash";

pub const DEFAULT_IDLE_POS_SECS: i64 = 0;
pub const DEFAULT_IDLE_OFFICE_SECS: i64 = 600;
pub const IDLE_MIN_SECS: i64 = 60;
pub const IDLE_MAX_SECS: i64 = 3600;

pub const SHOP_NAME_MAX: usize = 40;
pub const ADDRESS_MAX: usize = 48;
pub const FOOTER_MAX: usize = 48;

/// The settings the Settings screen edits. Field names match the UI contract.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopSettings {
    pub shop_name: String,
    pub address_line1: String,
    pub address_line2: String,
    pub address_line3: String,
    pub gstin: String,
    pub fssai_no: String,
    pub phone: String,
    pub bill_footer: String,
}

pub(crate) fn get_raw(conn: &Connection, key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |r| {
            r.get(0)
        })
        .optional()?)
}

pub(crate) fn set_raw(conn: &Connection, key: &str, value: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )?;
    Ok(())
}

/// Control characters and invisible formatting characters (zero-width, bidi overrides, byte
/// order mark, ...) have no place in a name or a bill line: they can hide or reorder text.
pub(crate) fn is_bad_char(c: char) -> bool {
    c.is_control()
        || matches!(
            c as u32,
            0x00AD
                | 0x061C
                | 0x180E
                | 0x200B..=0x200F
                | 0x2028..=0x202E
                | 0x2060..=0x206F
                | 0xFEFF
                | 0xFFF9..=0xFFFB
                | 0xE0000..=0xE007F
        )
}

/// Indic letters and vowel signs (Devanagari to Malayalam blocks, which include Tamil
/// U+0B80-U+0BFF). Digits, spaces and punctuation do not count.
fn is_indic_letter_or_mark(c: char) -> bool {
    (0x0900..=0x0DFF).contains(&(c as u32)) && !c.is_numeric() && !c.is_whitespace()
}

/// True if the text holds a control or invisible character. The zero-width joiner and
/// non-joiner (U+200D, U+200C) are allowed only between two Indic letters or marks, where
/// Tamil and other Indic scripts need them for correct shaping.
pub(crate) fn has_bad_chars(s: &str) -> bool {
    let chars: Vec<char> = s.chars().collect();
    chars.iter().enumerate().any(|(i, &c)| {
        if c == '\u{200C}' || c == '\u{200D}' {
            let before = i.checked_sub(1).and_then(|j| chars.get(j));
            let after = chars.get(i + 1);
            !matches!((before, after),
                (Some(&b), Some(&a)) if is_indic_letter_or_mark(b) && is_indic_letter_or_mark(a))
        } else {
            is_bad_char(c)
        }
    })
}

/// Trim, then check 1..=max characters and no control or invisible characters.
/// `Err(())` means invalid.
pub(crate) fn clean_name(raw: &str, max: usize) -> std::result::Result<String, ()> {
    let s = raw.trim();
    let n = s.chars().count();
    if n == 0 || n > max || has_bad_chars(s) {
        return Err(());
    }
    Ok(s.to_string())
}

fn clean_line(
    raw: &str,
    max: usize,
    required: bool,
    field: &str,
    empty_msg: &str,
    long_msg: &str,
    errors: &mut Vec<FieldError>,
) -> String {
    let s = raw.trim().to_string();
    if s.is_empty() {
        if required {
            errors.push(FieldError::new(field, empty_msg));
        }
        return String::new();
    }
    if s.chars().count() > max || has_bad_chars(&s) {
        errors.push(FieldError::new(field, long_msg));
    }
    s
}

/// Phone: remove spaces and `-`, drop a +91 / 91 / 0 prefix, then exactly 10 digits.
fn normalize_phone(raw: &str) -> std::result::Result<String, String> {
    let s: String = raw.chars().filter(|c| *c != ' ' && *c != '-').collect();
    if s.is_empty() {
        return Err("Enter the shop phone number.".to_string());
    }
    let body = match s.strip_prefix("+91") {
        Some(rest) => rest.to_string(),
        None => s.clone(),
    };
    if !body.chars().all(|c| c.is_ascii_digit()) {
        return Err("Phone can have digits only.".to_string());
    }
    let digits = if s.starts_with("+91") {
        body
    } else if body.len() == 12 && body.starts_with("91") {
        body[2..].to_string()
    } else if body.len() == 11 && body.starts_with('0') {
        body[1..].to_string()
    } else {
        body
    };
    if digits.len() != 10 {
        return Err(format!(
            "Phone must be 10 digits. You typed {}.",
            digits.len()
        ));
    }
    Ok(digits)
}

const GSTIN_CHARS: &[u8] = b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

fn gstin_check_char(first14: &[u8]) -> Option<u8> {
    let mut sum = 0usize;
    for (i, c) in first14.iter().enumerate() {
        let v = GSTIN_CHARS.iter().position(|x| x == c)?;
        let p = v * if i % 2 == 0 { 1 } else { 2 };
        sum += p / 36 + p % 36;
    }
    GSTIN_CHARS.get((36 - sum % 36) % 36).copied()
}

fn normalize_gstin(raw: &str) -> std::result::Result<String, String> {
    let g: String = raw
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .to_uppercase();
    if g.is_empty() {
        return Ok(g);
    }
    let n = g.chars().count();
    if n != 15 {
        return Err(format!("GSTIN must be 15 characters. You typed {n}."));
    }
    let b = g.as_bytes();
    let format_ok = b[..2].iter().all(u8::is_ascii_digit)
        && b[2..7].iter().all(u8::is_ascii_uppercase)
        && b[7..11].iter().all(u8::is_ascii_digit)
        && b[11].is_ascii_uppercase()
        && (b[12].is_ascii_digit() && b[12] != b'0' || b[12].is_ascii_uppercase())
        && b[13] == b'Z'
        && (b[14].is_ascii_digit() || b[14].is_ascii_uppercase());
    if !format_ok {
        return Err(
            "GSTIN format is not right. It looks like 33ABCDE1234F1Z5. Check your GST certificate."
                .to_string(),
        );
    }
    if gstin_check_char(&b[..14]) != Some(b[14]) {
        return Err(
            "One character in the GSTIN is wrong. Check each letter against your GST certificate."
                .to_string(),
        );
    }
    Ok(g)
}

fn normalize_fssai(raw: &str) -> std::result::Result<String, String> {
    let s = raw.trim().to_string();
    if s.is_empty() {
        return Ok(s);
    }
    let n = s.chars().count();
    if !s.chars().all(|c| c.is_ascii_digit()) {
        return Err("FSSAI number can have digits only.".to_string());
    }
    if n != 14 {
        return Err(format!("FSSAI number must be 14 digits. You typed {n}."));
    }
    Ok(s)
}

/// Check and clean the form. Returns the cleaned values and the list of wrong fields
/// (empty list = good to save). Inputs are trimmed first.
pub fn normalize_shop_settings(input: &ShopSettings) -> (ShopSettings, Vec<FieldError>) {
    let mut errors = Vec::new();
    let mut out = ShopSettings {
        shop_name: clean_line(
            &input.shop_name,
            SHOP_NAME_MAX,
            true,
            "shopName",
            "Enter the shop name.",
            "Shop name can be at most 40 characters.",
            &mut errors,
        ),
        address_line1: clean_line(
            &input.address_line1,
            ADDRESS_MAX,
            true,
            "addressLine1",
            "Enter the first address line.",
            "Address line can be at most 48 characters.",
            &mut errors,
        ),
        address_line2: clean_line(
            &input.address_line2,
            ADDRESS_MAX,
            false,
            "addressLine2",
            "",
            "Address line can be at most 48 characters.",
            &mut errors,
        ),
        address_line3: clean_line(
            &input.address_line3,
            ADDRESS_MAX,
            false,
            "addressLine3",
            "",
            "Address line can be at most 48 characters.",
            &mut errors,
        ),
        bill_footer: clean_line(
            &input.bill_footer,
            FOOTER_MAX,
            false,
            "billFooter",
            "",
            "Footer line can be at most 48 characters.",
            &mut errors,
        ),
        ..ShopSettings::default()
    };
    match normalize_phone(&input.phone) {
        Ok(p) => out.phone = p,
        Err(m) => errors.push(FieldError::new("phone", m)),
    }
    match normalize_gstin(&input.gstin) {
        Ok(g) => out.gstin = g,
        Err(m) => errors.push(FieldError::new("gstin", m)),
    }
    match normalize_fssai(&input.fssai_no) {
        Ok(f) => out.fssai_no = f,
        Err(m) => errors.push(FieldError::new("fssaiNo", m)),
    }
    (out, errors)
}

/// Field errors only (the UI calls this on leaving a field and on save).
pub fn validate_shop_settings(input: &ShopSettings) -> Vec<FieldError> {
    normalize_shop_settings(input).1
}

/// Idle limit rule: POS may be 0 (never) or 60-3600; Office 60-3600.
pub fn validate_idle_secs(app: AppKind, secs: i64) -> bool {
    (IDLE_MIN_SECS..=IDLE_MAX_SECS).contains(&secs) || (app == AppKind::Pos && secs == 0)
}

pub fn load_shop_settings(conn: &Connection) -> Result<ShopSettings> {
    let get = |k: &str| -> Result<String> { Ok(get_raw(conn, k)?.unwrap_or_default()) };
    Ok(ShopSettings {
        shop_name: get(KEY_SHOP_NAME)?,
        address_line1: get(KEY_ADDRESS1)?,
        address_line2: get(KEY_ADDRESS2)?,
        address_line3: get(KEY_ADDRESS3)?,
        gstin: get(KEY_GSTIN)?,
        fssai_no: get(KEY_FSSAI)?,
        phone: get(KEY_PHONE)?,
        bill_footer: get(KEY_BILL_FOOTER)?,
    })
}

/// Shop name, address line 1 and a valid phone are saved. (GSTIN and FSSAI optional for now;
/// the CA decides later.)
pub fn is_shop_set_up(conn: &Connection) -> Result<bool> {
    let s = load_shop_settings(conn)?;
    Ok(!s.shop_name.trim().is_empty()
        && !s.address_line1.trim().is_empty()
        && normalize_phone(&s.phone).is_ok())
}

/// Idle limit in seconds for this app (0 = never). Falls back to the default when unset/bad.
pub fn idle_timeout_secs(conn: &Connection, app: AppKind) -> Result<i64> {
    let (key, default) = match app {
        AppKind::Pos => (KEY_IDLE_POS, DEFAULT_IDLE_POS_SECS),
        AppKind::Office => (KEY_IDLE_OFFICE, DEFAULT_IDLE_OFFICE_SECS),
    };
    let v = get_raw(conn, key)?
        .and_then(|s| s.parse::<i64>().ok())
        .filter(|v| validate_idle_secs(app, *v))
        .unwrap_or(default);
    Ok(v)
}

/// Save shop settings (caller has already checked the user is an owner). All or nothing:
/// one audit row per changed key with old and new value.
pub fn save_shop_settings(
    tx: &Connection,
    user_id: i64,
    app: AppKind,
    input: &ShopSettings,
) -> Result<ShopSettings> {
    let (clean, errors) = normalize_shop_settings(input);
    if !errors.is_empty() {
        return Err(Error::Validation(errors));
    }
    let old = load_shop_settings(tx)?;
    let pairs = [
        (KEY_SHOP_NAME, &old.shop_name, &clean.shop_name),
        (KEY_ADDRESS1, &old.address_line1, &clean.address_line1),
        (KEY_ADDRESS2, &old.address_line2, &clean.address_line2),
        (KEY_ADDRESS3, &old.address_line3, &clean.address_line3),
        (KEY_PHONE, &old.phone, &clean.phone),
        (KEY_GSTIN, &old.gstin, &clean.gstin),
        (KEY_FSSAI, &old.fssai_no, &clean.fssai_no),
        (KEY_BILL_FOOTER, &old.bill_footer, &clean.bill_footer),
    ];
    for (key, before, after) in pairs {
        if before != after {
            set_raw(tx, key, after)?;
            audit::log(
                tx,
                Some(user_id),
                event::SETTINGS_CHANGED,
                &Detail::new(app)
                    .str("key", key)
                    .str("old", before)
                    .str("new", after),
            )?;
        }
    }
    Ok(clean)
}

/// Save the idle limits (owner only; not part of the Settings form contract yet).
pub fn save_idle_timeouts(
    tx: &Connection,
    user_id: i64,
    app: AppKind,
    pos_secs: i64,
    office_secs: i64,
) -> Result<()> {
    let mut errors = Vec::new();
    if !validate_idle_secs(AppKind::Pos, pos_secs) {
        errors.push(FieldError::new(
            "idleLockSecsPos",
            "Idle lock time must be 0 (never) or between 60 and 3600 seconds.",
        ));
    }
    if !validate_idle_secs(AppKind::Office, office_secs) {
        errors.push(FieldError::new(
            "idleLockSecsOffice",
            "Idle logout time must be between 60 and 3600 seconds.",
        ));
    }
    if !errors.is_empty() {
        return Err(Error::Validation(errors));
    }
    for (key, secs, app_of_key) in [
        (KEY_IDLE_POS, pos_secs, AppKind::Pos),
        (KEY_IDLE_OFFICE, office_secs, AppKind::Office),
    ] {
        let old = idle_timeout_secs(tx, app_of_key)?;
        if old != secs {
            set_raw(tx, key, &secs.to_string())?;
            audit::log(
                tx,
                Some(user_id),
                event::SETTINGS_CHANGED,
                &Detail::new(app)
                    .str("key", key)
                    .str("old", &old.to_string())
                    .str("new", &secs.to_string()),
            )?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Db;

    fn good() -> ShopSettings {
        ShopSettings {
            shop_name: "Gokul Oils".into(),
            address_line1: "12 Main Road".into(),
            phone: "98765 43210".into(),
            ..ShopSettings::default()
        }
    }

    fn msg(input: &ShopSettings, field: &str) -> Option<String> {
        validate_shop_settings(input)
            .into_iter()
            .find(|e| e.field == field)
            .map(|e| e.message)
    }

    #[test]
    fn good_settings_pass_and_phone_is_stored_as_10_digits() {
        let (clean, errors) = normalize_shop_settings(&good());
        assert!(errors.is_empty());
        assert_eq!(clean.phone, "9876543210");
    }

    #[test]
    fn required_fields() {
        let errs = validate_shop_settings(&ShopSettings::default());
        let fields: Vec<_> = errs.iter().map(|e| e.field.as_str()).collect();
        assert_eq!(fields, ["shopName", "addressLine1", "phone"]);
        assert_eq!(
            msg(&ShopSettings::default(), "shopName").as_deref(),
            Some("Enter the shop name.")
        );
    }

    #[test]
    fn length_limits_count_characters_not_bytes() {
        let mut s = good();
        s.shop_name = "க".repeat(40);
        assert!(validate_shop_settings(&s).is_empty());
        s.shop_name = "க".repeat(41);
        assert_eq!(
            msg(&s, "shopName").as_deref(),
            Some("Shop name can be at most 40 characters.")
        );
        let mut s = good();
        s.address_line2 = "x".repeat(49);
        assert!(msg(&s, "addressLine2").is_some());
        s.address_line2 = "x".repeat(48);
        s.bill_footer = "y".repeat(49);
        assert_eq!(
            msg(&s, "billFooter").as_deref(),
            Some("Footer line can be at most 48 characters.")
        );
    }

    #[test]
    fn phone_normalising() {
        for (raw, want) in [
            ("+91 98765-43210", "9876543210"),
            ("919876543210", "9876543210"),
            ("09876543210", "9876543210"),
            ("98765 43210", "9876543210"),
            ("98765-43210", "9876543210"),
        ] {
            assert_eq!(normalize_phone(raw).as_deref(), Ok(want), "{raw}");
        }
        assert_eq!(
            normalize_phone("987654321"),
            Err("Phone must be 10 digits. You typed 9.".to_string())
        );
        assert_eq!(
            normalize_phone("98765x3210"),
            Err("Phone can have digits only.".to_string())
        );
        assert!(normalize_phone("").is_err());
    }

    #[test]
    fn gstin_rules() {
        // Widely published sample GSTINs with correct check characters.
        for ok in ["27AAPFU0939F1ZV", "07AAGFF2194N1Z1"] {
            assert_eq!(normalize_gstin(ok).as_deref(), Ok(ok), "{ok}");
        }
        assert_eq!(
            normalize_gstin(" 27aapfu0939f1zv ").as_deref(),
            Ok("27AAPFU0939F1ZV")
        );
        assert_eq!(normalize_gstin("").as_deref(), Ok(""));
        assert_eq!(
            normalize_gstin("27AAPFU0939F1Z"),
            Err("GSTIN must be 15 characters. You typed 14.".to_string())
        );
        assert!(normalize_gstin("2AAAPFU0939F1ZV")
            .unwrap_err()
            .starts_with("GSTIN format is not right"));
        assert!(normalize_gstin("27AAPFU0939F1ZX")
            .unwrap_err()
            .starts_with("One character in the GSTIN is wrong"));
    }

    #[test]
    fn fssai_rules() {
        assert_eq!(
            normalize_fssai("12345678901234").as_deref(),
            Ok("12345678901234")
        );
        assert_eq!(normalize_fssai("").as_deref(), Ok(""));
        assert_eq!(
            normalize_fssai("1234567890123"),
            Err("FSSAI number must be 14 digits. You typed 13.".to_string())
        );
        assert!(normalize_fssai("1234567890123x").is_err());
    }

    #[test]
    fn fssai_letters_get_the_digits_only_message() {
        assert_eq!(
            normalize_fssai("ABCDEFGHIJKLMN"),
            Err("FSSAI number can have digits only.".to_string())
        );
        assert_eq!(
            normalize_fssai("1234567890123x"),
            Err("FSSAI number can have digits only.".to_string())
        );
        assert_eq!(
            normalize_fssai("123"),
            Err("FSSAI number must be 14 digits. You typed 3.".to_string())
        );
    }

    #[test]
    fn joiners_are_allowed_only_between_indic_letters() {
        // Tamil conjunct with a joiner / non-joiner after the virama or between letters.
        assert!(!has_bad_chars("க\u{0BCD}\u{200D}ஷ"));
        assert!(!has_bad_chars("க\u{200C}ஷ"));
        assert!(!has_bad_chars("செல்வி Gokul"));
        // At the start, at the end, next to a space, a digit or Latin letters: refused.
        assert!(has_bad_chars("\u{200D}க"));
        assert!(has_bad_chars("க\u{200D}"));
        assert!(has_bad_chars("க \u{200D}ஷ"));
        assert!(has_bad_chars("க\u{200D} ஷ"));
        assert!(has_bad_chars("a\u{200D}b"));
        assert!(has_bad_chars("\u{0BE7}\u{200C}ஷ"));
        // Everything else invisible stays refused, even between Tamil letters.
        assert!(has_bad_chars("க\u{200B}ஷ"));
        assert!(has_bad_chars("க\u{202E}ஷ"));
        assert!(has_bad_chars("க\u{FEFF}ஷ"));
    }

    #[test]
    fn idle_ranges() {
        assert!(validate_idle_secs(AppKind::Pos, 0));
        assert!(!validate_idle_secs(AppKind::Office, 0));
        assert!(validate_idle_secs(AppKind::Pos, 60));
        assert!(validate_idle_secs(AppKind::Office, 3600));
        assert!(!validate_idle_secs(AppKind::Pos, 59));
        assert!(!validate_idle_secs(AppKind::Pos, 3601));
    }

    #[test]
    fn idle_defaults_and_save() {
        let mut db = Db::open_in_memory().expect("db");
        assert_eq!(idle_timeout_secs(db.conn(), AppKind::Pos).expect("get"), 0);
        assert_eq!(
            idle_timeout_secs(db.conn(), AppKind::Office).expect("get"),
            600
        );
        let tx = db.transaction().expect("tx");
        assert!(save_idle_timeouts(&tx, 1, AppKind::Office, 30, 600).is_err());
        tx.rollback().expect("rb");
    }

    #[test]
    fn shop_set_up_rule() {
        let mut db = Db::open_in_memory().expect("db");
        assert!(!is_shop_set_up(db.conn()).expect("q"));
        let tx = db.transaction().expect("tx");
        tx.execute(
            "INSERT INTO users (name, role, pin_hash) VALUES ('Owner', 'owner', 'x')",
            [],
        )
        .expect("owner");
        let uid = tx.last_insert_rowid();
        save_shop_settings(&tx, uid, AppKind::Office, &good()).expect("save");
        tx.commit().expect("commit");
        assert!(is_shop_set_up(db.conn()).expect("q"));
    }
}
