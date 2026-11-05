use crate::error::{Error, Result};
use std::path::PathBuf;

/// `%APPDATA%\GokulRetail`
pub fn app_root() -> Result<PathBuf> {
    let appdata = std::env::var_os("APPDATA").ok_or(Error::NoDataDir)?;
    Ok(PathBuf::from(appdata).join("GokulRetail"))
}

/// `%APPDATA%\GokulRetail\data\gokul.db`
pub fn default_db_path() -> Result<PathBuf> {
    Ok(app_root()?.join("data").join("gokul.db"))
}

/// `%APPDATA%\GokulRetail\logs`
pub fn logs_dir() -> Result<PathBuf> {
    Ok(app_root()?.join("logs"))
}
