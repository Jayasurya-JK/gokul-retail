use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

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
}

impl Error {
    /// Plain-language message safe to show to shop staff.
    pub fn user_message(&self) -> String {
        match self {
            Error::DatabaseNewerThanApp { .. } | Error::NoDataDir => self.to_string(),
            Error::UnknownItem(_) | Error::InvalidMovement(_) | Error::QuantityOverflow(_) => {
                format!("Stock could not be updated: {self}")
            }
            _ => {
                "Something went wrong while using the data file. The details were saved in the log."
                    .to_string()
            }
        }
    }
}
