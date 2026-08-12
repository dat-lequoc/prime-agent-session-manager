import { invoke, listen } from "@/transport";
import type { SessionFamily } from "@/types";

export function listRuntimeSessionFamilies(): Promise<SessionFamily[]> {
  return invoke<SessionFamily[]>("list_session_families");
}

export function getRuntimeSessionFamily(familyId: string): Promise<SessionFamily | null> {
  return invoke<SessionFamily | null>("get_session_family", { familyId });
}

export function listenForSessionFamilyChanges(callback: () => void): Promise<() => void> {
  return listen("session-families-changed", callback);
}
