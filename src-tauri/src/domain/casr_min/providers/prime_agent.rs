use std::path::{Path, PathBuf};

use chrono::{DateTime, Utc};

use crate::domain::casr_min::model::CanonicalSession;

pub fn session_roots() -> Vec<PathBuf> {
    crate::paths::prime_agent_sessions_dir().ok().filter(|path| path.is_dir()).map(|path| vec![path]).unwrap_or_default()
}

pub fn read_session(path: &Path) -> Result<CanonicalSession, String> {
    let mut session = super::pi_agent::read_session(path)?;
    session.provider_slug = "prime-agent".to_string();
    session.metadata["source"] = serde_json::Value::String("prime_agent".to_string());
    Ok(session)
}

pub fn read_session_from_str(path_hint: &Path, content: &str) -> Result<CanonicalSession, String> {
    let mut session = super::pi_agent::read_session_from_str(path_hint, content)?;
    session.provider_slug = "prime-agent".to_string();
    session.metadata["source"] = serde_json::Value::String("prime_agent".to_string());
    Ok(session)
}

pub fn render_session(_session: &CanonicalSession, _target_session_id: &str) -> Result<String, String> {
    Err("Prime-Agent is a scan-only provider".to_string())
}

pub fn build_target_path(_session: &CanonicalSession, _target_session_id: &str, _now: DateTime<Utc>) -> Result<PathBuf, String> {
    Err("Prime-Agent is a scan-only provider".to_string())
}

pub fn resume_command(target_path: &Path) -> String {
    format!("prime-agent --resume {}", shell_quote(target_path.to_string_lossy().as_ref()))
}

fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resume_command_quotes_paths_safely() {
        assert_eq!(resume_command(Path::new("/tmp/a b'c.jsonl")), "prime-agent --resume '/tmp/a b'\\''c.jsonl'");
    }
}
