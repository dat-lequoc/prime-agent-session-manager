import { getRuntimeMode } from "./runtimeMode";
import { isStandaloneDatasetRuntime } from "@/browser-dataset";

interface RuntimeBuildEnv {
  readonly VITE_PUBLIC_READ_ONLY?: string;
}

export function shouldSkipOnboardingForRuntime(
  env: RuntimeBuildEnv = import.meta.env as RuntimeBuildEnv,
): boolean {
  return (
    env.VITE_PUBLIC_READ_ONLY === "true" ||
    env.VITE_PUBLIC_READ_ONLY === "1" ||
    getRuntimeMode() === "demo" ||
    isStandaloneDatasetRuntime()
  );
}

export function shouldBypassAuthGate(): boolean {
  return getRuntimeMode() !== "backend";
}

export function shouldShowConnectionBanner(): boolean {
  if (getRuntimeMode() === "backend") return true
  if (typeof window === "undefined") return false
  const isTauri = !!(window as { __TAURI__?: unknown }).__TAURI__
  return isTauri && localStorage.getItem("psm.remoteMode") === "true"
}
