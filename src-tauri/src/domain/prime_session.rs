use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeUsage {
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    pub total_tokens: u64,
    pub cost: f64,
}

impl PrimeUsage {
    fn from_value(value: &Value) -> Self {
        let cost = value.get("cost").map(|cost| cost.get("total").and_then(Value::as_f64).unwrap_or_else(|| ["input", "output", "cacheRead", "cacheWrite"].into_iter().filter_map(|key| cost.get(key).and_then(Value::as_f64)).sum()));
        let input = value.get("input").and_then(Value::as_u64).unwrap_or(0);
        let output = value.get("output").and_then(Value::as_u64).unwrap_or(0);
        let cache_read = value.get("cacheRead").or_else(|| value.get("cache_read")).and_then(Value::as_u64).unwrap_or(0);
        let cache_write = value.get("cacheWrite").or_else(|| value.get("cache_write")).and_then(Value::as_u64).unwrap_or(0);
        let component_total = input + output + cache_read + cache_write;
        let reported_total = value.get("totalTokens").or_else(|| value.get("total_tokens")).and_then(Value::as_u64).unwrap_or(0);
        Self { input, output, cache_read, cache_write, total_tokens: if component_total > 0 { component_total } else { reported_total }, cost: cost.unwrap_or(0.0) }
    }

    fn add_assign(&mut self, other: &Self) {
        self.input += other.input;
        self.output += other.output;
        self.cache_read += other.cache_read;
        self.cache_write += other.cache_write;
        self.total_tokens += other.total_tokens;
        self.cost += other.cost;
    }

    fn saturating_difference(&self, other: &Self) -> Self {
        Self {
            input: self.input.saturating_sub(other.input),
            output: self.output.saturating_sub(other.output),
            cache_read: self.cache_read.saturating_sub(other.cache_read),
            cache_write: self.cache_write.saturating_sub(other.cache_write),
            total_tokens: self.total_tokens.saturating_sub(other.total_tokens),
            cost: (self.cost - other.cost).max(0.0),
        }
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeTranscriptSummary {
    pub session_id: String,
    pub path: String,
    pub model: Option<String>,
    pub provider: Option<String>,
    pub status: Option<String>,
    pub message_count: usize,
    pub own_usage: PrimeUsage,
    pub aggregate_usage: PrimeUsage,
    pub attributed_usage: PrimeUsage,
    pub latest_goal: Option<Value>,
    pub latest_agent_status: Option<Value>,
    pub latest_refinement: Option<Value>,
    pub thinking_level: Option<String>,
    pub service_tier: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeThreadSummary {
    pub child_id: String,
    pub session_id: Option<String>,
    pub name: String,
    pub status: String,
    pub model: Option<String>,
    pub depth: u64,
    pub prompt: Option<String>,
    pub spawn_code: Option<String>,
    pub transcript_path: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub transcript: Option<PrimeTranscriptSummary>,
    pub children: Vec<PrimeThreadSummary>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeKernelSummary {
    pub available: bool,
    pub version: Option<u64>,
    pub python_version: Option<String>,
    pub timestamp: Option<String>,
    pub serialized_bytes: u64,
    pub saved_names: Vec<String>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeHarnessSummary {
    pub available: bool,
    pub schema: Option<u64>,
    pub memories: usize,
    pub prompts: usize,
    pub skills: usize,
    pub subagents: usize,
    pub refinements: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeArtifactReference {
    pub kind: String,
    pub path: String,
    pub exists: bool,
    pub size: u64,
    pub modified_ms: u64,
    pub opaque: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
pub struct PrimeSessionBundle {
    pub revision: String,
    pub root: PrimeTranscriptSummary,
    pub artifact_dir: String,
    pub resume_command: String,
    pub thread_count: usize,
    pub running_thread_count: usize,
    pub threads: Vec<PrimeThreadSummary>,
    pub descendants_own_usage: PrimeUsage,
    pub kernel: PrimeKernelSummary,
    pub harness: PrimeHarnessSummary,
    pub artifacts: Vec<PrimeArtifactReference>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone)]
struct PrimeHeader {
    id: String,
}

pub fn is_prime_root_session_path(path: &Path) -> bool {
    let Ok(root) = crate::paths::prime_agent_sessions_dir() else {
        return false;
    };
    path.extension().and_then(|value| value.to_str()) == Some("jsonl") && path.parent() == Some(root.as_path())
}

pub fn artifact_path_to_root_session(path: &Path) -> Option<PathBuf> {
    let artifacts_root = crate::paths::prime_agent_session_artifacts_dir().ok()?;
    let relative = path.strip_prefix(&artifacts_root).ok()?;
    let root_id = relative.components().next()?.as_os_str().to_str()?;
    find_root_session_by_header_id(root_id)
}

pub fn build_prime_session_bundle(root_path: &Path) -> Result<PrimeSessionBundle, String> {
    if !is_prime_root_session_path(root_path) {
        return Err(format!("Not a Prime Agent root session: {}", root_path.display()));
    }

    let header = read_header(root_path)?;
    let artifact_dir = crate::paths::prime_agent_session_artifacts_dir()?.join(&header.id);
    let root = summarize_transcript(root_path)?;
    let mut warnings = Vec::new();
    if root.session_id != header.id {
        warnings.push("Prime session header identity could not be reconciled".to_string());
    }
    if root_path.file_stem().and_then(|value| value.to_str()) != Some(header.id.as_str()) {
        warnings.push(format!("Transcript filename differs from authoritative header id {}", header.id));
    }
    if !artifact_dir.exists() {
        warnings.push("No Prime session artifact directory exists yet".to_string());
    }

    let mut visited = HashSet::new();
    let threads = collect_threads(&artifact_dir, &mut visited, &mut warnings);
    let thread_count = count_threads(&threads);
    let running_thread_count = count_running_threads(&threads);
    let mut descendants_own_usage = PrimeUsage::default();
    sum_descendant_usage(&threads, &mut descendants_own_usage);

    let kernel = read_kernel_summary(&artifact_dir.join("kernel-state.json"));
    let harness = read_harness_summary(&artifact_dir.join("harness").join("harness_state.json"));
    let artifacts = collect_artifact_references(&artifact_dir);
    let revision = calculate_revision(root_path, &artifact_dir);

    Ok(PrimeSessionBundle { revision, resume_command: super::casr_min::providers::prime_agent::resume_command(root_path), root, artifact_dir: artifact_dir.to_string_lossy().to_string(), thread_count, running_thread_count, threads, descendants_own_usage, kernel, harness, artifacts, warnings })
}

fn read_header(path: &Path) -> Result<PrimeHeader, String> {
    let file = File::open(path).map_err(|error| format!("Failed to open Prime session {}: {error}", path.display()))?;
    let first_line = BufReader::new(file).lines().next().transpose().map_err(|error| format!("Failed to read Prime session header {}: {error}", path.display()))?.ok_or_else(|| "Prime session is empty".to_string())?;
    let value: Value = serde_json::from_str(&first_line).map_err(|error| format!("Invalid Prime session header {}: {error}", path.display()))?;
    if value.get("type").and_then(Value::as_str) != Some("session") {
        return Err(format!("Prime session {} has no session header", path.display()));
    }
    let id = value.get("id").and_then(Value::as_str).filter(|value| !value.trim().is_empty()).ok_or_else(|| format!("Prime session {} has no header id", path.display()))?;
    Ok(PrimeHeader { id: id.to_string() })
}

fn summarize_transcript(path: &Path) -> Result<PrimeTranscriptSummary, String> {
    let header = read_header(path)?;
    let file = File::open(path).map_err(|error| format!("Failed to open Prime transcript {}: {error}", path.display()))?;
    let mut assistant_usage: HashMap<String, PrimeUsage> = HashMap::new();
    let mut attributed_usage: HashMap<String, PrimeUsage> = HashMap::new();
    let mut summary = PrimeTranscriptSummary { session_id: header.id, path: path.to_string_lossy().to_string(), ..PrimeTranscriptSummary::default() };

    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let Ok(value) = serde_json::from_str::<Value>(&line) else { continue };
        match value.get("type").and_then(Value::as_str) {
            Some("message") => {
                summary.message_count += 1;
                let Some(message) = value.get("message") else { continue };
                if message.get("role").and_then(Value::as_str) == Some("assistant") {
                    summary.model = message.get("model").and_then(Value::as_str).map(ToString::to_string).or(summary.model);
                    summary.provider = message.get("provider").and_then(Value::as_str).map(ToString::to_string).or(summary.provider);
                    if let (Some(id), Some(usage)) = (value.get("id").and_then(Value::as_str), message.get("usage")) {
                        assistant_usage.insert(id.to_string(), PrimeUsage::from_value(usage));
                    }
                }
            }
            Some("child_usage_attributed") => {
                if let (Some(target_id), Some(aggregate)) = (value.get("targetId").and_then(Value::as_str), value.get("aggregateUsage")) {
                    attributed_usage.insert(target_id.to_string(), PrimeUsage::from_value(aggregate));
                }
            }
            Some("agent_status") => summary.latest_agent_status = value.get("status").cloned(),
            Some("session_state") => summary.status = value.pointer("/state/status").and_then(Value::as_str).map(ToString::to_string),
            Some("model_change") => {
                summary.model = value.get("modelId").and_then(Value::as_str).map(ToString::to_string).or(summary.model);
                summary.provider = value.get("provider").and_then(Value::as_str).map(ToString::to_string).or(summary.provider);
            }
            Some("thinking_level_change") => summary.thinking_level = value.get("thinkingLevel").and_then(Value::as_str).map(ToString::to_string),
            Some("service_tier_change") => summary.service_tier = value.get("serviceTier").and_then(Value::as_str).map(ToString::to_string),
            Some("custom") => match value.get("customType").and_then(Value::as_str) {
                Some("thread_goal_state") => summary.latest_goal = value.get("data").cloned(),
                Some("prime-agent.refinement") => summary.latest_refinement = value.get("data").cloned(),
                _ => {}
            },
            _ => {}
        }
    }

    for (id, usage) in &assistant_usage {
        summary.own_usage.add_assign(usage);
        summary.aggregate_usage.add_assign(attributed_usage.get(id).unwrap_or(usage));
    }
    summary.attributed_usage = summary.aggregate_usage.saturating_difference(&summary.own_usage);
    Ok(summary)
}

fn collect_threads(artifact_dir: &Path, visited: &mut HashSet<PathBuf>, warnings: &mut Vec<String>) -> Vec<PrimeThreadSummary> {
    let registry_path = artifact_dir.join("rlm-subagents.jsonl");
    if !registry_path.is_file() {
        return Vec::new();
    }
    let canonical_key = fs::canonicalize(&registry_path).unwrap_or(registry_path.clone());
    if !visited.insert(canonical_key) {
        warnings.push(format!("Skipped recursive Prime sub-agent registry at {}", registry_path.display()));
        return Vec::new();
    }

    let file = match File::open(&registry_path) {
        Ok(file) => file,
        Err(error) => {
            warnings.push(format!("Failed to read {}: {error}", registry_path.display()));
            return Vec::new();
        }
    };
    let mut latest: HashMap<String, Value> = HashMap::new();
    for line in BufReader::new(file).lines().map_while(Result::ok) {
        let Ok(value) = serde_json::from_str::<Value>(&line) else { continue };
        let Some(child_id) = value.get("childId").and_then(Value::as_str) else { continue };
        latest.insert(child_id.to_string(), value);
    }

    let mut threads = latest.into_iter().map(|(child_id, value)| build_thread_summary(&child_id, &value, artifact_dir, visited)).collect::<Vec<_>>();
    threads.sort_by(|left, right| right.updated_at.cmp(&left.updated_at).then_with(|| left.name.cmp(&right.name)));
    threads
}

fn build_thread_summary(child_id: &str, value: &Value, parent_artifact_dir: &Path, visited: &mut HashSet<PathBuf>) -> PrimeThreadSummary {
    let mut warnings = Vec::new();
    let session_dir = value.get("sessionDir").and_then(Value::as_str).map(PathBuf::from).unwrap_or_else(|| parent_artifact_dir.join(child_id));
    let transcript_path = resolve_child_transcript(value, &session_dir);
    let transcript = transcript_path.as_deref().and_then(|path| match summarize_transcript(path) {
        Ok(summary) => Some(summary),
        Err(error) => {
            warnings.push(error);
            None
        }
    });
    if transcript_path.is_none() {
        warnings.push("Child transcript is not available yet".to_string());
    }
    let session_id = transcript.as_ref().map(|item| item.session_id.clone());
    let children = collect_threads(&session_dir, visited, &mut warnings);
    PrimeThreadSummary {
        child_id: child_id.to_string(),
        session_id,
        name: value.get("sessionName").and_then(Value::as_str).unwrap_or(child_id).to_string(),
        status: value.get("status").and_then(Value::as_str).unwrap_or("unknown").to_string(),
        model: model_label(value.get("model")),
        depth: value.get("rlmDepth").and_then(Value::as_u64).unwrap_or(1),
        prompt: value.get("prompt").and_then(Value::as_str).map(ToString::to_string),
        spawn_code: value.get("spawnCode").and_then(Value::as_str).map(ToString::to_string),
        transcript_path: transcript_path.map(|path| path.to_string_lossy().to_string()),
        created_at: timestamp_label(value.get("createdAt")),
        updated_at: timestamp_label(value.get("updatedAt")),
        transcript,
        children,
        warnings,
    }
}

fn resolve_child_transcript(value: &Value, session_dir: &Path) -> Option<PathBuf> {
    if let Some(path) = value.get("sessionFile").and_then(Value::as_str).map(PathBuf::from).filter(|path| path.is_file()) {
        return Some(path);
    }
    let mut candidates = fs::read_dir(session_dir).ok()?.flatten().map(|entry| entry.path()).filter(|path| path.is_file() && path.extension().and_then(|value| value.to_str()) == Some("jsonl") && path.file_name().and_then(|value| value.to_str()) != Some("rlm-subagents.jsonl")).collect::<Vec<_>>();
    candidates.sort_by_key(|path| fs::metadata(path).and_then(|metadata| metadata.modified()).ok());
    candidates.pop()
}

fn model_label(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    let provider = value.get("provider").and_then(Value::as_str);
    let model = value.get("modelId").or_else(|| value.get("model")).and_then(Value::as_str);
    match (provider, model) {
        (Some(provider), Some(model)) => Some(format!("{provider}/{model}")),
        (_, Some(model)) => Some(model.to_string()),
        _ => None,
    }
}

fn timestamp_label(value: Option<&Value>) -> Option<String> {
    let value = value?;
    if let Some(text) = value.as_str() {
        return Some(text.to_string());
    }
    value.as_i64().and_then(chrono::DateTime::from_timestamp_millis).map(|date| date.to_rfc3339())
}

fn read_kernel_summary(path: &Path) -> PrimeKernelSummary {
    let Ok(content) = fs::read_to_string(path) else { return PrimeKernelSummary::default() };
    let Ok(value) = serde_json::from_str::<Value>(&content) else { return PrimeKernelSummary::default() };
    PrimeKernelSummary {
        available: true,
        version: value.get("version").and_then(Value::as_u64),
        python_version: value.get("pythonVersion").and_then(Value::as_str).map(ToString::to_string),
        timestamp: value.get("timestamp").and_then(Value::as_str).map(ToString::to_string),
        serialized_bytes: value.get("bytes").and_then(Value::as_u64).unwrap_or(0),
        saved_names: string_array(value.get("savedNames")),
        skipped: string_array(value.get("skipped")),
    }
}

fn read_harness_summary(path: &Path) -> PrimeHarnessSummary {
    let Ok(content) = fs::read_to_string(path) else { return PrimeHarnessSummary::default() };
    let Ok(value) = serde_json::from_str::<Value>(&content) else { return PrimeHarnessSummary::default() };
    PrimeHarnessSummary {
        available: true,
        schema: value.get("schema").and_then(Value::as_u64),
        memories: object_len(value.pointer("/entries/memory")),
        prompts: object_len(value.pointer("/entries/prompt")),
        skills: object_len(value.pointer("/entries/skill")),
        subagents: object_len(value.pointer("/entries/subagent")),
        refinements: value.get("refinements").and_then(Value::as_array).map_or(0, Vec::len),
    }
}

fn string_array(value: Option<&Value>) -> Vec<String> {
    value.and_then(Value::as_array).map(|items| items.iter().filter_map(Value::as_str).map(ToString::to_string).collect()).unwrap_or_default()
}

fn object_len(value: Option<&Value>) -> usize {
    value.and_then(Value::as_object).map_or(0, serde_json::Map::len)
}

fn count_threads(threads: &[PrimeThreadSummary]) -> usize {
    threads.iter().map(|thread| 1 + count_threads(&thread.children)).sum()
}

fn count_running_threads(threads: &[PrimeThreadSummary]) -> usize {
    threads.iter().map(|thread| usize::from(matches!(thread.status.as_str(), "running" | "queued" | "active")) + count_running_threads(&thread.children)).sum()
}

fn sum_descendant_usage(threads: &[PrimeThreadSummary], total: &mut PrimeUsage) {
    for thread in threads {
        if let Some(transcript) = &thread.transcript {
            total.add_assign(&transcript.own_usage);
        }
        sum_descendant_usage(&thread.children, total);
    }
}

fn collect_artifact_references(artifact_dir: &Path) -> Vec<PrimeArtifactReference> {
    [
        ("kernel-state", artifact_dir.join("kernel-state.json"), false),
        ("kernel-snapshot", artifact_dir.join("kernel-state.dill"), true),
        ("rlm-registry", artifact_dir.join("rlm-subagents.jsonl"), false),
        ("harness", artifact_dir.join("harness").join("harness_state.json"), false),
        ("scheduled-jobs", artifact_dir.join("scheduled-jobs.json"), false),
    ]
    .into_iter()
    .map(|(kind, path, opaque)| {
        let metadata = fs::metadata(&path).ok();
        PrimeArtifactReference { kind: kind.to_string(), path: path.to_string_lossy().to_string(), exists: metadata.is_some(), size: metadata.as_ref().map_or(0, fs::Metadata::len), modified_ms: metadata.as_ref().map(modified_ms).unwrap_or(0), opaque }
    })
    .collect()
}

fn calculate_revision(root_path: &Path, artifact_dir: &Path) -> String {
    let mut modified = fs::metadata(root_path).ok().map(|metadata| modified_ms(&metadata)).unwrap_or(0);
    let mut bytes = fs::metadata(root_path).ok().map(|metadata| metadata.len()).unwrap_or(0);
    accumulate_revision(artifact_dir, &mut modified, &mut bytes);
    format!("{modified:x}-{bytes:x}")
}

fn accumulate_revision(path: &Path, modified: &mut u64, bytes: &mut u64) {
    let Ok(entries) = fs::read_dir(path) else { return };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else { continue };
        *modified = (*modified).max(modified_ms(&metadata));
        *bytes = bytes.saturating_add(metadata.len());
        if metadata.is_dir() {
            accumulate_revision(&path, modified, bytes);
        }
    }
}

fn modified_ms(metadata: &fs::Metadata) -> u64 {
    metadata.modified().ok().and_then(|time| time.duration_since(UNIX_EPOCH).ok()).map(|duration| duration.as_millis() as u64).unwrap_or(0)
}

fn find_root_session_by_header_id(session_id: &str) -> Option<PathBuf> {
    let root = crate::paths::prime_agent_sessions_dir().ok()?;
    let direct = root.join(format!("{session_id}.jsonl"));
    if direct.is_file() && read_header(&direct).ok().is_some_and(|header| header.id == session_id) {
        return Some(direct);
    }
    fs::read_dir(root).ok()?.flatten().map(|entry| entry.path()).filter(|path| path.extension().and_then(|value| value.to_str()) == Some("jsonl")).find(|path| read_header(path).ok().is_some_and(|header| header.id == session_id))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_lines(path: &Path, lines: &[Value]) {
        let mut file = File::create(path).expect("create transcript");
        for line in lines {
            writeln!(file, "{}", serde_json::to_string(line).expect("serialize")).expect("write");
        }
    }

    #[test]
    fn late_child_attribution_replaces_target_usage() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("root.jsonl");
        write_lines(
            &path,
            &[
                serde_json::json!({"type":"session","id":"header-id","timestamp":"2026-01-01T00:00:00Z","cwd":"/tmp"}),
                serde_json::json!({"type":"message","id":"a1","timestamp":"2026-01-01T00:00:01Z","message":{"role":"assistant","model":"m","usage":{"input":10,"output":2,"totalTokens":12}}}),
                serde_json::json!({"type":"child_usage_attributed","id":"u1","targetId":"a1","aggregateUsage":{"input":20,"output":5,"totalTokens":25}}),
                serde_json::json!({"type":"child_usage_attributed","id":"u2","targetId":"a1","aggregateUsage":{"input":30,"output":7,"totalTokens":37}}),
                serde_json::json!({"type":"child_usage_attributed","id":"unknown","targetId":"missing","aggregateUsage":{"input":999,"totalTokens":999}}),
            ],
        );
        let summary = summarize_transcript(&path).expect("summary");
        assert_eq!(summary.session_id, "header-id");
        assert_eq!(summary.own_usage.total_tokens, 12);
        assert_eq!(summary.aggregate_usage.total_tokens, 37);
        assert_eq!(summary.attributed_usage.total_tokens, 25);
    }

    #[test]
    fn component_usage_repairs_stale_reported_totals() {
        let usage = PrimeUsage::from_value(&serde_json::json!({
            "input": 30,
            "output": 7,
            "cacheRead": 11,
            "cacheWrite": 2,
            "totalTokens": 12
        }));
        assert_eq!(usage.total_tokens, 50);
    }

    #[test]
    fn registry_is_last_write_wins_and_missing_transcript_is_preserved() {
        let temp = tempfile::tempdir().expect("tempdir");
        let registry = temp.path().join("rlm-subagents.jsonl");
        write_lines(&registry, &[serde_json::json!({"childId":"sub-a","sessionName":"first","status":"running","sessionDir":temp.path().join("sub-a")}), serde_json::json!({"childId":"sub-a","sessionName":"latest","status":"completed","sessionDir":temp.path().join("sub-a")})]);
        let mut visited = HashSet::new();
        let mut warnings = Vec::new();
        let threads = collect_threads(temp.path(), &mut visited, &mut warnings);
        assert_eq!(threads.len(), 1);
        assert_eq!(threads[0].name, "latest");
        assert_eq!(threads[0].status, "completed");
        assert!(threads[0].transcript.is_none());
    }
}
