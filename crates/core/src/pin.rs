//! PIN type, policy and hashing (Argon2id). Spec 00 step 3, sections A and B.

use crate::auth::Role;
use crate::error::{Error, Result};
use argon2::password_hash::rand_core::OsRng;
use argon2::password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString};
use argon2::{Algorithm, Argon2, Params, Version};
use std::fmt;
use std::sync::OnceLock;
use zeroize::Zeroize;

/// The one place the hashing cost is set. Calibrate on the shop PC (verify 150-200 ms, release).
pub struct HashParams {
    pub m_kib: u32,
    pub t: u32,
    pub p: u32,
    pub out_len: usize,
}

pub const PARAMS: HashParams = HashParams {
    m_kib: 19456,
    t: 3,
    p: 1,
    out_len: 32,
};

pub const OWNER_PIN_LEN: usize = 6;
pub const PIN_MIN_LEN: usize = 4;
pub const PIN_MAX_LEN: usize = 6;

/// A PIN typed by a person. Debug prints `***`; the memory is wiped when dropped.
pub struct Pin(String);

impl Pin {
    pub fn new(raw: String) -> Pin {
        Pin(raw)
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Debug for Pin {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Pin(***)")
    }
}

impl Drop for Pin {
    fn drop(&mut self) {
        self.0.zeroize();
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PinError {
    NotDigits,
    BadLength,
    OwnerLength,
    TooEasy,
    SameAsCurrent,
}

impl fmt::Display for PinError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            PinError::NotDigits => "PIN can have digits only.",
            PinError::BadLength => "PIN must be 4 to 6 digits.",
            PinError::OwnerLength => "The owner PIN must be exactly 6 digits.",
            PinError::TooEasy => "This PIN is too easy to guess. Choose another.",
            PinError::SameAsCurrent => "The new PIN must be different from the current PIN.",
        })
    }
}

const DENY_LIST: [&str; 8] = [
    "2580", "1004", "2000", "2024", "2025", "2026", "1122", "0123",
];

/// Format check only (digits, 4-6). Used by login so garbage never reaches the hasher.
pub fn check_pin_format(pin: &str) -> std::result::Result<(), PinError> {
    if pin.is_empty() || !pin.bytes().all(|b| b.is_ascii_digit()) {
        return Err(PinError::NotDigits);
    }
    if !(PIN_MIN_LEN..=PIN_MAX_LEN).contains(&pin.len()) {
        return Err(PinError::BadLength);
    }
    Ok(())
}

/// Full policy for choosing a new PIN.
pub fn validate_pin(pin: &str, role: Role) -> std::result::Result<(), PinError> {
    check_pin_format(pin)?;
    if role == Role::Owner && pin.len() != OWNER_PIN_LEN {
        return Err(PinError::OwnerLength);
    }
    let d: Vec<i32> = pin.bytes().map(|b| i32::from(b - b'0')).collect();
    let all_same = d.windows(2).all(|w| w[0] == w[1]);
    let ascending = d.windows(2).all(|w| w[1] - w[0] == 1);
    let descending = d.windows(2).all(|w| w[0] - w[1] == 1);
    // A short block repeated (1212, 121212, 123123, 696969) or digits in pairs (1122, 112233).
    let repeated_block = (1..d.len())
        .filter(|p| d.len().is_multiple_of(*p))
        .any(|p| (0..d.len()).all(|i| d[i] == d[i % p]));
    let pairs = d.len().is_multiple_of(2) && d.chunks(2).all(|c| c[0] == c[1]);
    if all_same || ascending || descending || repeated_block || pairs || DENY_LIST.contains(&pin) {
        return Err(PinError::TooEasy);
    }
    Ok(())
}

/// Hashing behind a trait so tests can use cheap parameters.
pub trait PinHasher: Send + Sync {
    /// Returns a full PHC string (`$argon2id$...`) with a fresh random salt.
    fn hash(&self, secret: &str) -> Result<String>;
    /// Constant-time check. A malformed stored hash counts as a mismatch.
    fn verify(&self, secret: &str, phc: &str) -> bool;
    /// True when the stored hash was made with other parameters than this hasher's.
    fn needs_rehash(&self, phc: &str) -> bool;
    /// Spend the same time as a real check (used for unknown users).
    fn dummy_verify(&self, secret: &str);
}

pub struct Argon2Hasher {
    m_kib: u32,
    t: u32,
    p: u32,
    out_len: usize,
    dummy: OnceLock<String>,
}

impl Argon2Hasher {
    /// Production parameters from `PARAMS`.
    pub fn new() -> Argon2Hasher {
        Argon2Hasher::with_params(PARAMS.m_kib, PARAMS.t, PARAMS.p)
    }

    /// Custom cost, for tests and the calibration benchmark.
    pub fn with_params(m_kib: u32, t: u32, p: u32) -> Argon2Hasher {
        Argon2Hasher {
            m_kib,
            t,
            p,
            out_len: PARAMS.out_len,
            dummy: OnceLock::new(),
        }
    }

    fn engine(&self) -> Result<Argon2<'static>> {
        let params = Params::new(self.m_kib, self.t, self.p, Some(self.out_len))
            .map_err(|e| Error::Internal(format!("hash parameters: {e}")))?;
        Ok(Argon2::new(Algorithm::Argon2id, Version::V0x13, params))
    }
}

impl Default for Argon2Hasher {
    fn default() -> Self {
        Argon2Hasher::new()
    }
}

impl PinHasher for Argon2Hasher {
    fn hash(&self, secret: &str) -> Result<String> {
        let salt = SaltString::generate(&mut OsRng);
        let phc = self
            .engine()?
            .hash_password(secret.as_bytes(), &salt)
            .map_err(|e| Error::Internal(format!("hashing failed: {e}")))?;
        Ok(phc.to_string())
    }

    fn verify(&self, secret: &str, phc: &str) -> bool {
        let Ok(parsed) = PasswordHash::new(phc) else {
            return false;
        };
        // Parameters come from the stored hash, so old hashes still verify after a cost change.
        Argon2::default()
            .verify_password(secret.as_bytes(), &parsed)
            .is_ok()
    }

    fn needs_rehash(&self, phc: &str) -> bool {
        let Ok(parsed) = PasswordHash::new(phc) else {
            return true;
        };
        let same = parsed.algorithm.as_str() == "argon2id"
            && parsed.version == Some(0x13)
            && Params::try_from(&parsed).is_ok_and(|p| {
                p.m_cost() == self.m_kib
                    && p.t_cost() == self.t
                    && p.p_cost() == self.p
                    && p.output_len() == Some(self.out_len)
            });
        !same
    }

    fn dummy_verify(&self, secret: &str) {
        if let Some(dummy) = self.dummy.get() {
            let _ = self.verify(secret, dummy);
            return;
        }
        match self.hash("dummy-not-a-real-pin") {
            Ok(h) => {
                let _ = self.verify(secret, &h);
                let _ = self.dummy.set(h);
            }
            // Never cache a useless hash: spend the same time on a real one each call.
            Err(_) => {
                let _ = self.hash(secret);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cheap() -> Argon2Hasher {
        Argon2Hasher::with_params(8, 1, 1)
    }

    #[test]
    fn cashier_table() {
        let ok = ["4821", "73915", "902846", "1357", "7249"];
        for p in ok {
            assert_eq!(validate_pin(p, Role::Cashier), Ok(()), "{p}");
        }
        let cases = [
            ("", PinError::NotDigits),
            ("12a4", PinError::NotDigits),
            (" 4821", PinError::NotDigits),
            ("12 4", PinError::NotDigits),
            ("\u{0661}\u{0662}\u{0663}\u{0664}", PinError::NotDigits),
            ("123", PinError::BadLength),
            ("1234567", PinError::BadLength),
            ("1111", PinError::TooEasy),
            ("000000", PinError::TooEasy),
            ("1234", PinError::TooEasy),
            ("654321", PinError::TooEasy),
            ("4321", PinError::TooEasy),
            ("1212", PinError::TooEasy),
            ("123123", PinError::TooEasy),
            ("121212", PinError::TooEasy),
            ("696969", PinError::TooEasy),
            ("9696", PinError::TooEasy),
            ("112233", PinError::TooEasy),
            ("4455", PinError::TooEasy),
            ("2580", PinError::TooEasy),
            ("1004", PinError::TooEasy),
            ("2000", PinError::TooEasy),
            ("2024", PinError::TooEasy),
            ("2025", PinError::TooEasy),
            ("2026", PinError::TooEasy),
            ("1122", PinError::TooEasy),
            ("0123", PinError::TooEasy),
        ];
        for (p, e) in cases {
            assert_eq!(validate_pin(p, Role::Cashier), Err(e), "{p:?}");
        }
    }

    #[test]
    fn owner_must_be_exactly_six_digits() {
        assert_eq!(validate_pin("739158", Role::Owner), Ok(()));
        assert_eq!(
            validate_pin("7391", Role::Owner),
            Err(PinError::OwnerLength)
        );
        assert_eq!(
            validate_pin("73915", Role::Owner),
            Err(PinError::OwnerLength)
        );
        assert_eq!(validate_pin("123456", Role::Owner), Err(PinError::TooEasy));
        assert_eq!(validate_pin("111111", Role::Owner), Err(PinError::TooEasy));
        assert_eq!(
            validate_pin("abcdef", Role::Owner),
            Err(PinError::NotDigits)
        );
    }

    #[test]
    fn hash_round_trip_and_phc_format() {
        let h = cheap();
        let a = h.hash("739158").expect("hash");
        let b = h.hash("739158").expect("hash");
        assert!(a.starts_with("$argon2id$v=19$"));
        assert_ne!(a, b, "salts must differ");
        assert!(h.verify("739158", &a));
        assert!(!h.verify("739159", &a));
        assert!(!h.verify("739158", "not a hash"));
    }

    #[test]
    fn rehash_detected_when_params_change() {
        let old = cheap();
        let new = Argon2Hasher::with_params(16, 2, 1);
        let phc = old.hash("739158").expect("hash");
        assert!(!old.needs_rehash(&phc));
        assert!(new.needs_rehash(&phc));
        assert!(new.verify("739158", &phc), "old hashes still verify");
        assert!(new.needs_rehash("garbage"));
    }

    #[test]
    fn dummy_verify_never_caches_an_empty_hash() {
        // Invalid parameters make every hash fail; dummy_verify must neither panic nor cache.
        let broken = Argon2Hasher::with_params(0, 0, 0);
        broken.dummy_verify("1234");
        broken.dummy_verify("1234");
        assert!(broken.dummy.get().is_none());
        let ok = cheap();
        ok.dummy_verify("1234");
        let cached = ok.dummy.get().expect("cached");
        assert!(cached.starts_with("$argon2id$"));
    }

    #[test]
    fn production_params_are_the_spec_values() {
        assert_eq!(
            (PARAMS.m_kib, PARAMS.t, PARAMS.p, PARAMS.out_len),
            (19456, 3, 1, 32)
        );
    }

    #[test]
    fn pin_debug_is_redacted() {
        let p = Pin::new("739158".to_string());
        let shown = format!("{p:?}");
        assert!(!shown.contains("739158"));
        assert!(shown.contains("***"));
    }
}
