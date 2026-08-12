use crate::domain::session_family::SessionFamily;

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_session_families() -> Result<Vec<SessionFamily>, String> {
    tokio::task::spawn_blocking(crate::domain::session_family::list_session_families).await.map_err(|error| format!("Join family listing task: {error}"))?
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_family(family_id: String) -> Result<Option<SessionFamily>, String> {
    tokio::task::spawn_blocking(move || crate::domain::session_family::get_session_family(&family_id)).await.map_err(|error| format!("Join family lookup task: {error}"))?
}
