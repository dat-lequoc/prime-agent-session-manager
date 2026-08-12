use crate::types::SessionInfo;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Component, Path, PathBuf};

pub const SESSION_FAMILY_SCHEMA: &str = "arena-session-family-v1";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFamilyThread {
    pub thread_id: String,
    pub native_session_id: Option<String>,
    pub parent_thread_id: Option<String>,
    pub relationship: String,
    pub label: String,
    pub status: String,
    pub model: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    #[serde(default)]
    pub usage: Value,
    #[serde(default)]
    pub activity: Value,
    pub session_path: String,
    pub session: SessionInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionFamily {
    pub schema_version: String,
    pub family_id: String,
    pub run_id: String,
    pub task: Option<String>,
    pub task_display_name: Option<String>,
    pub harness: Option<String>,
    pub model: Option<String>,
    pub status: Option<String>,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub root_thread_id: String,
    pub generation: u64,
    pub updated_at: String,
    pub threads: Vec<SessionFamilyThread>,
}

#[derive(Debug, Deserialize)]
struct RawSessionFamily {
    schema_version: String,
    family_id: String,
    run_id: String,
    task: Option<String>,
    task_display_name: Option<String>,
    harness: Option<String>,
    model: Option<String>,
    status: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    root_thread_id: String,
    #[serde(default)]
    generation: u64,
    updated_at: String,
    threads: Vec<RawSessionFamilyThread>,
}

#[derive(Debug, Deserialize)]
struct RawSessionFamilyThread {
    thread_id: String,
    native_session_id: Option<String>,
    parent_thread_id: Option<String>,
    #[serde(default = "default_relationship")]
    relationship: String,
    label: String,
    #[serde(default = "default_status")]
    status: String,
    model: Option<String>,
    started_at: Option<String>,
    finished_at: Option<String>,
    #[serde(default)]
    usage: Value,
    #[serde(default)]
    activity: Value,
    session_path: String,
}

fn default_relationship() -> String {
    "unknown".to_string()
}

fn default_status() -> String {
    "unknown".to_string()
}

pub fn families_dir() -> Result<PathBuf, String> {
    Ok(crate::paths::home_dir()?.join(".arena").join("families"))
}

pub fn list_session_families() -> Result<Vec<SessionFamily>, String> {
    let home = crate::paths::home_dir()?;
    list_session_families_from_home(&home)
}

pub fn get_session_family(family_id: &str) -> Result<Option<SessionFamily>, String> {
    validate_identifier(family_id, "family ID")?;
    let home = crate::paths::home_dir()?;
    let path = home.join(".arena").join("families").join(family_id).join("family.json");
    if !path.is_file() {
        return Ok(None);
    }
    load_family(&home, &path).map(Some)
}

fn list_session_families_from_home(home: &Path) -> Result<Vec<SessionFamily>, String> {
    let root = home.join(".arena").join("families");
    if !root.is_dir() {
        return Ok(Vec::new());
    }
    let mut families = Vec::new();
    for entry in fs::read_dir(&root).map_err(|error| format!("Read {}: {error}", root.display()))? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                log::warn!("Skipping unreadable session family directory entry in {}: {}", root.display(), error);
                continue;
            }
        };
        let path = entry.path().join("family.json");
        if path.is_file() {
            match load_family(home, &path) {
                Ok(family) => families.push(family),
                Err(error) => log::warn!("Skipping invalid session family manifest {}: {}", path.display(), error),
            }
        }
    }
    families.sort_by(|left, right| right.updated_at.cmp(&left.updated_at).then_with(|| left.family_id.cmp(&right.family_id)));
    Ok(families)
}

fn load_family(home: &Path, manifest_path: &Path) -> Result<SessionFamily, String> {
    let content = fs::read_to_string(manifest_path).map_err(|error| format!("Read {}: {error}", manifest_path.display()))?;
    let raw: RawSessionFamily = serde_json::from_str(&content).map_err(|error| format!("Parse {}: {error}", manifest_path.display()))?;
    validate_raw_family(&raw, manifest_path)?;

    let canonical_home = home.canonicalize().map_err(|error| format!("Resolve home {}: {error}", home.display()))?;
    let mut threads = Vec::with_capacity(raw.threads.len());
    for thread in raw.threads {
        let resolved_path = resolve_session_path(&canonical_home, &thread.session_path)?;
        let session = match crate::core::scanner::parse_session_info(&resolved_path) {
            Ok((mut session, _)) => {
                session.path = resolved_path.to_string_lossy().to_string();
                session
            }
            Err(error) => {
                log::warn!("Using pending family thread metadata for {}: {}", thread.thread_id, error);
                pending_session_info(&thread, &resolved_path, &raw.updated_at)
            }
        };
        threads.push(SessionFamilyThread {
            thread_id: thread.thread_id,
            native_session_id: thread.native_session_id,
            parent_thread_id: thread.parent_thread_id,
            relationship: thread.relationship,
            label: thread.label,
            status: thread.status,
            model: thread.model,
            started_at: thread.started_at,
            finished_at: thread.finished_at,
            usage: thread.usage,
            activity: thread.activity,
            session_path: resolved_path.to_string_lossy().to_string(),
            session,
        });
    }

    Ok(SessionFamily {
        schema_version: raw.schema_version,
        family_id: raw.family_id,
        run_id: raw.run_id,
        task: raw.task,
        task_display_name: raw.task_display_name,
        harness: raw.harness,
        model: raw.model,
        status: raw.status,
        started_at: raw.started_at,
        finished_at: raw.finished_at,
        root_thread_id: raw.root_thread_id,
        generation: raw.generation,
        updated_at: raw.updated_at,
        threads,
    })
}

fn pending_session_info(thread: &RawSessionFamilyThread, path: &Path, family_updated_at: &str) -> SessionInfo {
    let timestamp = thread.started_at.as_deref().and_then(parse_timestamp).or_else(|| parse_timestamp(family_updated_at)).unwrap_or_else(Utc::now);
    SessionInfo {
        path: path.to_string_lossy().to_string(),
        id: thread.native_session_id.clone().unwrap_or_else(|| thread.thread_id.clone()),
        cwd: "/app".to_string(),
        name: Some(thread.label.clone()),
        created: timestamp,
        modified: timestamp,
        message_count: 0,
        first_message: String::new(),
        user_messages_text: String::new(),
        assistant_messages_text: String::new(),
        last_message: String::new(),
        last_message_role: String::new(),
        parent_session_path: None,
        model: thread.model.clone(),
        models: thread.model.clone().map(|model| vec![model]),
    }
}

fn parse_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value).ok().map(|value| value.with_timezone(&Utc))
}

fn validate_raw_family(raw: &RawSessionFamily, manifest_path: &Path) -> Result<(), String> {
    if raw.schema_version != SESSION_FAMILY_SCHEMA {
        return Err(format!("Unsupported family schema in {}: {}", manifest_path.display(), raw.schema_version));
    }
    validate_identifier(&raw.family_id, "family ID")?;
    validate_identifier(&raw.run_id, "run ID")?;
    validate_identifier(&raw.root_thread_id, "root thread ID")?;
    if manifest_path.parent().and_then(Path::file_name).and_then(|value| value.to_str()) != Some(raw.family_id.as_str()) {
        return Err("Family ID does not match its manifest directory".to_string());
    }
    if raw.threads.is_empty() {
        return Err("Family has no threads".to_string());
    }

    let mut by_id = HashMap::new();
    let mut session_paths = HashSet::new();
    for thread in &raw.threads {
        validate_identifier(&thread.thread_id, "thread ID")?;
        if by_id.insert(thread.thread_id.as_str(), thread).is_some() {
            return Err(format!("Duplicate thread ID: {}", thread.thread_id));
        }
        if !session_paths.insert(thread.session_path.as_str()) {
            return Err(format!("Duplicate session path: {}", thread.session_path));
        }
    }

    let roots = raw.threads.iter().filter(|thread| thread.parent_thread_id.is_none()).collect::<Vec<_>>();
    if roots.len() != 1 || roots[0].thread_id != raw.root_thread_id {
        return Err("Family must have exactly one root matching root_thread_id".to_string());
    }
    for thread in &raw.threads {
        if let Some(parent_id) = &thread.parent_thread_id {
            if parent_id == &thread.thread_id {
                return Err(format!("Thread {} cannot parent itself", thread.thread_id));
            }
            if !by_id.contains_key(parent_id.as_str()) {
                return Err(format!("Thread {} has missing parent {}", thread.thread_id, parent_id));
            }
        }
    }
    for thread in &raw.threads {
        let mut seen = HashSet::new();
        let mut cursor = Some(thread.thread_id.as_str());
        while let Some(thread_id) = cursor {
            if !seen.insert(thread_id) {
                return Err(format!("Cycle detected at thread {thread_id}"));
            }
            cursor = by_id.get(thread_id).and_then(|item| item.parent_thread_id.as_deref());
        }
    }
    Ok(())
}

fn validate_identifier(value: &str, label: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 255 || value == "." || value == ".." || !value.chars().all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | ':' | '.')) {
        return Err(format!("Invalid {label}: {value}"));
    }
    Ok(())
}

fn resolve_session_path(home: &Path, relative: &str) -> Result<PathBuf, String> {
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() || relative_path.components().any(|component| !matches!(component, Component::Normal(_))) {
        return Err(format!("Unsafe family session path: {relative}"));
    }
    let unresolved = home.join(relative_path);
    if !unresolved.exists() {
        let mut existing_ancestor = unresolved.as_path();
        while !existing_ancestor.exists() {
            existing_ancestor = existing_ancestor.parent().ok_or_else(|| format!("Unsafe family session path: {relative}"))?;
        }
        let canonical_ancestor = existing_ancestor.canonicalize().map_err(|error| format!("Resolve family session path {relative}: {error}"))?;
        if !canonical_ancestor.starts_with(home) {
            return Err(format!("Family session path escapes home: {relative}"));
        }
        return Ok(unresolved);
    }
    let resolved = unresolved.canonicalize().map_err(|error| format!("Resolve family session path {relative}: {error}"))?;
    if !resolved.starts_with(home) || !resolved.is_file() {
        return Err(format!("Family session path escapes home: {relative}"));
    }
    Ok(resolved)
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn write_family(home: &Path, family_id: &str, threads: Value) {
        let family_dir = home.join(".arena/families").join(family_id);
        fs::create_dir_all(&family_dir).unwrap();
        fs::write(
            family_dir.join("family.json"),
            serde_json::to_vec(&serde_json::json!({
                "schema_version": SESSION_FAMILY_SCHEMA,
                "family_id": family_id,
                "run_id": family_id,
                "root_thread_id": "root",
                "generation": 1,
                "updated_at": "2026-08-12T00:00:00Z",
                "threads": threads,
            }))
            .unwrap(),
        )
        .unwrap();
    }

    fn write_session(home: &Path, relative: &str, id: &str) {
        let path = home.join(relative);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, format!("{{\"type\":\"session\",\"id\":\"{id}\",\"timestamp\":\"2026-08-12T00:00:00Z\",\"cwd\":\"/app\"}}\n")).unwrap();
    }

    fn thread(id: &str, parent: Option<&str>, path: &str) -> Value {
        serde_json::json!({
            "thread_id": id,
            "parent_thread_id": parent,
            "relationship": if parent.is_some() { "delegated" } else { "root" },
            "label": id,
            "status": "completed",
            "session_path": path,
        })
    }

    #[test]
    fn loads_valid_nested_family_with_unindexed_child() {
        let temp = TempDir::new().unwrap();
        write_session(temp.path(), ".pi/agent/sessions/arena/run/root.jsonl", "root-native");
        write_session(temp.path(), ".arena/thread-sessions/run/child.jsonl", "child-native");
        write_family(temp.path(), "run", serde_json::json!([thread("root", None, ".pi/agent/sessions/arena/run/root.jsonl"), thread("worker:1", Some("root"), ".arena/thread-sessions/run/child.jsonl"),]));

        let families = list_session_families_from_home(temp.path()).unwrap();
        assert_eq!(families.len(), 1);
        assert_eq!(families[0].threads.len(), 2);
        assert!(families[0].threads[1].session.path.ends_with("child.jsonl"));
    }

    #[test]
    fn keeps_family_accessible_while_a_live_thread_is_not_yet_parseable() {
        let temp = TempDir::new().unwrap();
        write_session(temp.path(), ".pi/agent/sessions/arena/run/root.jsonl", "root-native");
        let child_path = temp.path().join(".arena/thread-sessions/run/child.jsonl");
        fs::create_dir_all(child_path.parent().unwrap()).unwrap();
        fs::write(&child_path, "").unwrap();
        write_family(temp.path(), "run", serde_json::json!([thread("root", None, ".pi/agent/sessions/arena/run/root.jsonl"), thread("worker:1", Some("root"), ".arena/thread-sessions/run/child.jsonl"),]));

        let families = list_session_families_from_home(temp.path()).unwrap();
        assert_eq!(families[0].threads.len(), 2);
        assert_eq!(families[0].threads[1].session.id, "worker:1");
        assert_eq!(families[0].threads[1].session.message_count, 0);
    }

    #[test]
    fn keeps_family_accessible_before_a_live_thread_file_is_created() {
        let temp = TempDir::new().unwrap();
        write_session(temp.path(), ".pi/agent/sessions/arena/run/root.jsonl", "root-native");
        write_family(temp.path(), "run", serde_json::json!([thread("root", None, ".pi/agent/sessions/arena/run/root.jsonl"), thread("worker:1", Some("root"), ".arena/thread-sessions/run/child.jsonl"),]));

        let families = list_session_families_from_home(temp.path()).unwrap();
        assert_eq!(families[0].threads[1].session.id, "worker:1");
        assert_eq!(families[0].threads[1].session.message_count, 0);
    }

    #[test]
    fn skips_invalid_manifests_without_hiding_valid_families() {
        let temp = TempDir::new().unwrap();
        write_session(temp.path(), ".pi/agent/sessions/arena/valid/root.jsonl", "root-native");
        write_family(temp.path(), "valid", serde_json::json!([thread("root", None, ".pi/agent/sessions/arena/valid/root.jsonl")]));
        let invalid_dir = temp.path().join(".arena/families/invalid");
        fs::create_dir_all(&invalid_dir).unwrap();
        fs::write(invalid_dir.join("family.json"), "{").unwrap();

        let families = list_session_families_from_home(temp.path()).unwrap();
        assert_eq!(families.len(), 1);
        assert_eq!(families[0].family_id, "valid");
    }

    #[test]
    fn rejects_absolute_and_traversal_paths() {
        let temp = TempDir::new().unwrap();
        for path in ["/tmp/outside.jsonl", "../outside.jsonl"] {
            write_family(temp.path(), "run", serde_json::json!([thread("root", None, path)]));
            let error = load_family(temp.path(), &temp.path().join(".arena/families/run/family.json")).unwrap_err();
            assert!(error.contains("Unsafe family session path"));
        }
    }

    #[test]
    fn rejects_duplicate_missing_root_and_cycle_topologies() {
        let temp = TempDir::new().unwrap();
        let cases =
            [serde_json::json!([thread("root", None, "a.jsonl"), thread("root", Some("root"), "b.jsonl")]), serde_json::json!([thread("child", Some("missing"), "a.jsonl")]), serde_json::json!([thread("root", None, "a.jsonl"), thread("a", Some("b"), "b.jsonl"), thread("b", Some("a"), "c.jsonl")])];
        for threads in cases {
            write_family(temp.path(), "run", threads);
            assert!(load_family(temp.path(), &temp.path().join(".arena/families/run/family.json")).is_err());
        }
    }
}
