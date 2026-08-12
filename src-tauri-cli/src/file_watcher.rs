use crate::WsEvent;
use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use notify_debouncer_full::{new_debouncer, DebounceEventResult, Debouncer, FileIdMap};
use serde_json::Value;
use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{mpsc::channel, Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};
use tokio::sync::broadcast;
use tracing::{error, info, warn};

/// Check if a path should be excluded from watching.
/// Aligned with `should_skip_dir` in core/scanner.rs.
fn is_excluded_path(path: &std::path::Path) -> bool {
    path.components().any(|c| {
        let s = c.as_os_str();
        s == "subagent-artifacts" || s == "transcripts" || s == "subagents" || s == ".timelines" || s == "checkpoints"
    })
}

/// Check if a path is a session file (any supported format).
/// Aligned with `extend_candidate` in core/scanner.rs.
fn is_session_file(path: &std::path::Path) -> bool {
    let is_jsonl = path.extension().is_some_and(|ext| ext == "jsonl");
    let is_gemini = pi_session_manager::domain::session_bridge::is_gemini_session_file(path);
    let is_opencode = pi_session_manager::domain::session_bridge::is_opencode_db_path(path);
    is_jsonl || is_gemini || is_opencode
}

fn is_family_manifest(path: &std::path::Path) -> bool {
    path.file_name().is_some_and(|name| name == "family.json") && path.components().any(|component| component.as_os_str() == ".arena") && path.components().any(|component| component.as_os_str() == "families")
}

pub struct CliFileWatcher {
    _debouncer: Arc<Mutex<Debouncer<RecommendedWatcher, FileIdMap>>>,
}

impl CliFileWatcher {
    pub fn start(event_tx: broadcast::Sender<WsEvent>) -> Result<Self, String> {
        let config = pi_session_manager::config::Config::load().unwrap_or_default();
        let mut all_dirs = pi_session_manager::scanner::get_all_session_dirs(&config);
        if let Ok(families) = pi_session_manager::domain::session_family::families_dir() {
            if let Err(error) = std::fs::create_dir_all(&families) {
                warn!("Failed to prepare session family watch directory {}: {}", families.display(), error);
            } else if !all_dirs.contains(&families) {
                all_dirs.push(families);
            }
        }

        if all_dirs.is_empty() {
            return Err("No directories configured for file watcher".to_string());
        }

        let existing_paths: Vec<PathBuf> = all_dirs.into_iter().filter(|p| p.exists()).collect();
        if existing_paths.is_empty() {
            return Err("No existing session directories to watch".to_string());
        }

        info!("Starting CLI file watcher for {} directories", existing_paths.len());
        for p in &existing_paths {
            info!("  watch: {}", p.display());
        }

        let (tx, rx) = channel();
        let mut debouncer = new_debouncer(Duration::from_secs(3), None, tx).map_err(|e| format!("Failed to create file watcher: {e}"))?;

        for path in &existing_paths {
            debouncer.watcher().watch(path, RecursiveMode::Recursive).map_err(|e| format!("Failed to watch {}: {e}", path.display()))?;
        }

        thread::spawn(move || process_events(rx, event_tx));

        Ok(Self { _debouncer: Arc::new(Mutex::new(debouncer)) })
    }
}

fn process_events(rx: std::sync::mpsc::Receiver<DebounceEventResult>, event_tx: broadcast::Sender<WsEvent>) {
    let mut last_notification = Instant::now();
    let min_interval = Duration::from_secs(5);
    let mut pending_paths: HashSet<PathBuf> = HashSet::new();
    let mut families_changed = false;

    let rt = tokio::runtime::Builder::new_current_thread().enable_all().build().expect("Failed to create tokio runtime for CLI file watcher");

    loop {
        if let Ok(event_result) = rx.recv_timeout(Duration::from_secs(1)) {
            match event_result {
                Ok(events) => {
                    for event in &events {
                        for path in &event.paths {
                            if is_family_manifest(path) {
                                families_changed = true;
                                continue;
                            }
                            if !is_session_file(path) {
                                continue;
                            }

                            if !is_excluded_path(path) {
                                pending_paths.insert(path.clone());
                            }
                        }
                    }
                }
                Err(errors) => {
                    for e in errors {
                        error!("CLI watcher error: {:?}", e);
                    }
                }
            }
        }

        if (pending_paths.is_empty() && !families_changed) || last_notification.elapsed() < min_interval {
            continue;
        }

        if families_changed {
            let _ = event_tx.send(WsEvent { event_type: "event".to_string(), event: "session-families-changed".to_string(), payload: serde_json::json!({ "changed": true }) });
            families_changed = false;
        }

        if pending_paths.is_empty() {
            last_notification = Instant::now();
            continue;
        }

        // Mark watcher as active so ScannerScheduler skips redundant full scans.
        pi_session_manager::scanner::mark_watcher_active();

        let changed: Vec<String> = pending_paths.drain().map(|p| p.to_string_lossy().to_string()).collect();

        match rt.block_on(pi_session_manager::scanner::rescan_changed_files(changed)) {
            Ok(diff) => {
                if !diff.updated.is_empty() || !diff.removed.is_empty() {
                    let payload = serde_json::to_value(&diff).unwrap_or(Value::Null);
                    let _ = event_tx.send(WsEvent { event_type: "event".to_string(), event: "sessions-changed".to_string(), payload });
                }
            }
            Err(e) => warn!("CLI watcher rescan failed: {}", e),
        }

        last_notification = Instant::now();
    }
}
