//! The error shape the UI receives from every command (see the Command API contract in
//! `docs/specs/00-step3-login-security.md`). The code set is closed.

use crate::error::{Error, FieldError};
use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ErrorCode {
    #[serde(rename = "NOT_LOGGED_IN")]
    NotLoggedIn,
    #[serde(rename = "SESSION_EXPIRED")]
    SessionExpired,
    #[serde(rename = "PIN_CHANGE_REQUIRED")]
    PinChangeRequired,
    #[serde(rename = "PERMISSION_DENIED")]
    PermissionDenied,
    #[serde(rename = "WRONG_PIN")]
    WrongPin,
    #[serde(rename = "LOCKED")]
    Locked,
    #[serde(rename = "PIN_INVALID")]
    PinInvalid,
    #[serde(rename = "ALREADY_SETUP")]
    AlreadySetup,
    #[serde(rename = "SHOP_NOT_SET_UP")]
    ShopNotSetUp,
    #[serde(rename = "VALIDATION")]
    Validation,
    #[serde(rename = "NOT_FOUND")]
    NotFound,
    #[serde(rename = "DB_BUSY")]
    DbBusy,
    #[serde(rename = "DB_NEWER")]
    DbNewer,
    #[serde(rename = "INTERNAL")]
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seconds_left: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attempts_before_lock: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<FieldError>>,
}

impl AppError {
    fn plain(code: ErrorCode, message: String) -> AppError {
        AppError {
            code,
            message,
            seconds_left: None,
            attempts_before_lock: None,
            fields: None,
        }
    }

    /// For PIN_INVALID: say which form field the message belongs to ("pin" or "newPin").
    pub fn with_pin_field(mut self, field: &str) -> AppError {
        if self.code == ErrorCode::PinInvalid {
            self.fields = Some(vec![FieldError::new(field, self.message.clone())]);
        }
        self
    }

    /// True for errors that mean a bug or a broken data file (the command layer logs these).
    pub fn is_internal(&self) -> bool {
        self.code == ErrorCode::Internal
    }
}

impl From<&Error> for AppError {
    fn from(e: &Error) -> AppError {
        let message = e.user_message();
        match e {
            Error::NotLoggedIn => AppError::plain(ErrorCode::NotLoggedIn, message),
            Error::SessionExpired => AppError::plain(ErrorCode::SessionExpired, message),
            Error::PinChangeRequired => AppError::plain(ErrorCode::PinChangeRequired, message),
            Error::PermissionDenied => AppError::plain(ErrorCode::PermissionDenied, message),
            Error::WrongPin {
                attempts_before_lock,
            }
            | Error::WrongRecoveryCode {
                attempts_before_lock,
            } => AppError {
                attempts_before_lock: Some(*attempts_before_lock),
                ..AppError::plain(ErrorCode::WrongPin, message)
            },
            Error::Locked { seconds_left } => AppError {
                seconds_left: Some(*seconds_left),
                ..AppError::plain(ErrorCode::Locked, message)
            },
            Error::InvalidPin(_) => AppError {
                fields: Some(vec![FieldError::new("pin", message.clone())]),
                ..AppError::plain(ErrorCode::PinInvalid, message)
            },
            Error::AlreadySetup => AppError::plain(ErrorCode::AlreadySetup, message),
            Error::ShopNotSetUp => AppError::plain(ErrorCode::ShopNotSetUp, message),
            Error::Validation(fields) => AppError {
                fields: Some(fields.clone()),
                ..AppError::plain(ErrorCode::Validation, message)
            },
            Error::UserUnavailable | Error::NotFound(_) => {
                AppError::plain(ErrorCode::NotFound, message)
            }
            Error::DatabaseNewerThanApp { .. } => AppError::plain(ErrorCode::DbNewer, message),
            _ if e.is_busy() => AppError::plain(ErrorCode::DbBusy, message),
            _ => AppError::plain(ErrorCode::Internal, message),
        }
    }
}

impl From<Error> for AppError {
    fn from(e: Error) -> AppError {
        AppError::from(&e)
    }
}
