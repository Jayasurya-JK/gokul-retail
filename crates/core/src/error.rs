use std::fmt;

/// Error returned to the screens. `Display` is always a plain-English message a cashier can read.
#[derive(Debug)]
pub enum ApiError {
    /// The request was wrong (bad PIN, short payment, unknown bill...). Nothing was changed.
    Invalid(String),
    /// Something inside failed (disk, database). Nothing partial was saved.
    Internal(String),
}

impl fmt::Display for ApiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ApiError::Invalid(m) => write!(f, "{m}"),
            ApiError::Internal(m) => write!(f, "{m}"),
        }
    }
}

impl std::error::Error for ApiError {}

pub type Result<T> = std::result::Result<T, ApiError>;

pub fn invalid<T>(msg: impl Into<String>) -> Result<T> {
    Err(ApiError::Invalid(msg.into()))
}

impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        ApiError::Internal(format!("Database problem: {e}"))
    }
}

impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        ApiError::Invalid(format!("Bad request: {e}"))
    }
}

impl From<std::io::Error> for ApiError {
    fn from(e: std::io::Error) -> Self {
        ApiError::Internal(format!("Disk problem: {e}"))
    }
}
