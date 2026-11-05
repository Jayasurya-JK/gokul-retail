use serde::Serialize;

/// What the UI shows on its first screen.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    pub name: String,
    pub version: String,
    pub schema_version: i64,
}

impl AppInfo {
    /// Build the info record for an app from the open database.
    pub fn load(db: &crate::Db, name: &str, version: &str) -> crate::Result<AppInfo> {
        Ok(AppInfo {
            name: name.to_string(),
            version: version.to_string(),
            schema_version: db.schema_version()?,
        })
    }
}
