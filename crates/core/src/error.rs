use crate::pin::PinError;
use serde::Serialize;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

/// One wrong field in a form: which field and what to tell the person.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct FieldError {
    pub field: String,
    pub message: String,
}

impl FieldError {
    pub fn new(field: &str, message: impl Into<String>) -> FieldError {
        FieldError {
            field: field.to_string(),
            message: message.into(),
        }
    }
}

#[derive(Debug, Error)]
pub enum Error {
    #[error("database error: {0}")]
    Sqlite(#[from] rusqlite::Error),

    #[error("file error: {0}")]
    Io(#[from] std::io::Error),

    #[error(
        "This data file was created by a newer version of Gokul Retail (data version {db}, this app understands up to {app}). Please install the latest version. The data file was not changed."
    )]
    DatabaseNewerThanApp { db: i64, app: i64 },

    #[error("Could not find the folder for application data (APPDATA is not set).")]
    NoDataDir,

    #[error("item {0} does not exist")]
    UnknownItem(i64),

    #[error("invalid stock movement: {0}")]
    InvalidMovement(String),

    #[error("stock quantity out of range for item {0}")]
    QuantityOverflow(i64),

    #[error("migration {version} failed: {source}")]
    Migration {
        version: i64,
        #[source]
        source: rusqlite::Error,
    },

    #[error("could not read the database setting {0}")]
    Pragma(&'static str),

    // ---- login, session and permissions (spec 00 step 3) ----
    #[error("{0}")]
    InvalidPin(PinError),

    #[error("Wrong PIN.")]
    WrongPin { attempts_before_lock: u32 },

    #[error("Wrong recovery code.")]
    WrongRecoveryCode { attempts_before_lock: u32 },

    #[error("Too many wrong tries. Locked for {seconds_left} seconds.")]
    Locked { seconds_left: i64 },

    /// Unknown or switched-off user (after a dummy hash so timing is equal).
    #[error("This user has been switched off. Choose another name.")]
    UserUnavailable,

    #[error("Please sign in.")]
    NotLoggedIn,

    #[error("You were signed out after being idle. Please sign in again.")]
    SessionExpired,

    #[error("Please set a new PIN before continuing.")]
    PinChangeRequired,

    #[error("Only the owner can do this.")]
    PermissionDenied,

    #[error("The shop is already set up.")]
    AlreadySetup,

    #[error("The shop is not set up yet. Ask the owner to open Gokul Office.")]
    ShopNotSetUp,

    #[error("Some fields need fixing.")]
    Validation(Vec<FieldError>),

    #[error("{0} was not found.")]
    NotFound(&'static str),

    /// Hashing or random-number failure. Never contains a PIN.
    #[error("internal error: {0}")]
    Internal(String),
}

impl Error {
    /// True when SQLite says another process holds the file (busy timeout hit).
    pub fn is_busy(&self) -> bool {
        matches!(
            self,
            Error::Sqlite(rusqlite::Error::SqliteFailure(f, _))
                if matches!(
                    f.code,
                    rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked
                )
        ) || matches!(
            self,
            Error::Migration { source: rusqlite::Error::SqliteFailure(f, _), .. }
                if matches!(
                    f.code,
                    rusqlite::ErrorCode::DatabaseBusy | rusqlite::ErrorCode::DatabaseLocked
                )
        )
    }

    /// Plain-language message safe to show to shop staff.
    pub fn user_message(&self) -> String {
        match self {
            Error::DatabaseNewerThanApp { .. } | Error::NoDataDir => self.to_string(),
            Error::UnknownItem(_) | Error::InvalidMovement(_) | Error::QuantityOverflow(_) => {
                format!("Stock could not be updated: {self}")
            }
            Error::InvalidPin(_)
            | Error::Locked { .. }
            | Error::UserUnavailable
            | Error::NotLoggedIn
            | Error::SessionExpired
            | Error::PinChangeRequired
            | Error::PermissionDenied
            | Error::AlreadySetup
            | Error::ShopNotSetUp
            | Error::Validation(_)
            | Error::NotFound(_) => self.to_string(),
            Error::WrongPin {
                attempts_before_lock,
            } => format!("Wrong PIN. {attempts_before_lock} tries left."),
            Error::WrongRecoveryCode {
                attempts_before_lock,
            } => format!("Wrong recovery code. {attempts_before_lock} tries left."),
            _ if self.is_busy() => {
                "The shop data is busy. Wait a moment and try again.".to_string()
            }
            _ => {
                "Something went wrong while using the data file. The details were saved in the log."
                    .to_string()
            }
        }
    }
}
