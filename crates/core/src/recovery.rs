//! Owner PIN recovery code (spec rule 17, option A): 16 characters shown once at first run.
//! Only its Argon2 hash is stored.

use crate::error::{Error, Result};
use argon2::password_hash::rand_core::{OsRng, RngCore};

/// No 0/O/1/I so it can be read out and copied by hand.
const ALPHABET: &[u8; 32] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
pub const CODE_LEN: usize = 16;

/// New random code, shown to the owner as `XXXX-XXXX-XXXX-XXXX`.
pub fn generate() -> Result<String> {
    let mut bytes = [0u8; CODE_LEN];
    OsRng
        .try_fill_bytes(&mut bytes)
        .map_err(|_| Error::Internal("random number source failed".to_string()))?;
    let mut out = String::with_capacity(CODE_LEN + 3);
    for (i, b) in bytes.iter().enumerate() {
        if i > 0 && i % 4 == 0 {
            out.push('-');
        }
        // 32 symbols and 256 byte values: no modulo bias.
        out.push(char::from(ALPHABET[usize::from(b & 31)]));
    }
    Ok(out)
}

/// What gets hashed and compared: upper case, no dashes or spaces.
pub fn normalize(code: &str) -> String {
    code.chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .collect::<String>()
        .to_uppercase()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code_shape() {
        let c = generate().expect("code");
        assert_eq!(c.len(), 19);
        assert_eq!(normalize(&c).len(), CODE_LEN);
        assert!(normalize(&c).bytes().all(|b| ALPHABET.contains(&b)));
        assert_ne!(c, generate().expect("code"));
    }

    #[test]
    fn normalize_accepts_typing_variations() {
        assert_eq!(normalize(" abcd-efgh-jklm-npqr "), "ABCDEFGHJKLMNPQR");
    }
}
