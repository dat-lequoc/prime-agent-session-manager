/**
 * Route configuration for deep linking and URL-based navigation.
 *
 * All pages are URL-routable with stable session IDs.
 * Using HashRouter for Tauri compatibility.
 * URL format: http://localhost:52131/#/sessions/:sessionId
 */

export const ROUTES = {
  // Session views
  SESSIONS: '/',
  SESSION_DETAIL: '/sessions/:sessionId',
  NATIVE_SESSION_DETAIL: '/open/:nativeSessionId',
  SESSION_FAMILY_THREAD: '/families/:familyId/threads/:threadId',

  // Project view
  PROJECTS: '/projects',
  PROJECT: '/projects/:projectPath',

  // Feature views
  DASHBOARD: '/dashboard',
  SETTINGS: '/settings',
  TERMINAL: '/terminal',
} as const;

export type RouteKey = keyof typeof ROUTES;

/**
 * Parsed route representation.
 */
export type ParsedRoute =
  | { route: 'session'; sessionId: string }
  | { route: 'native-session'; nativeSessionId: string }
  | { route: 'session-family'; familyId: string; threadId: string }
  | { route: 'project'; projectPath: string | null }
  | { route: 'feature'; feature: 'dashboard' | 'settings' | 'terminal' }
  | { route: 'app'; path: string }
  | { route: 'root' };

const FEATURE_ROUTES: Record<string, 'dashboard' | 'settings' | 'terminal'> = {
  dashboard: 'dashboard',
  settings: 'settings',
  terminal: 'terminal',
};

/**
 * Parse a pathname into a structured route.
 */
export function parseRoute(pathname: string): ParsedRoute {
  const parts = pathname.split('/').filter(Boolean);

  if (parts[0] === 'sessions' && parts[1]) {
    return { route: 'session', sessionId: decodeURIComponent(parts[1]) };
  }

  if (parts[0] === 'open' && parts[1]) {
    return { route: 'native-session', nativeSessionId: decodeURIComponent(parts[1]) };
  }

  if (parts[0] === 'families' && parts[1] && parts[2] === 'threads' && parts[3]) {
    return {
      route: 'session-family',
      familyId: decodeURIComponent(parts[1]),
      threadId: decodeURIComponent(parts[3]),
    };
  }

  if (parts[0] === 'projects') {
    return { route: 'project', projectPath: parts[1] ? decodeURIComponent(parts[1]) : null };
  }

  if (parts[0] && parts[0] in FEATURE_ROUTES) {
    return { route: 'feature', feature: FEATURE_ROUTES[parts[0] as keyof typeof FEATURE_ROUTES] };
  }

  if (parts[0]) {
    return { route: 'app', path: pathname.startsWith('/') ? pathname : `/${pathname}` };
  }

  return { route: 'root' };
}

/**
 * Build a session detail URL from a stable session ID.
 */
export function buildSessionUrl(sessionId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}`;
}

export function buildNativeSessionUrl(nativeSessionId: string): string {
  return `/open/${encodeURIComponent(nativeSessionId)}`;
}

export function buildSessionFamilyUrl(familyId: string, threadId: string): string {
  return `/families/${encodeURIComponent(familyId)}/threads/${encodeURIComponent(threadId)}`;
}

/**
 * Build a project view URL from a project path.
 */
export function buildProjectUrl(projectPath: string): string {
  return `/projects/${encodeURIComponent(projectPath)}`;
}

/**
 * Build the project list URL.
 */
export function buildProjectsUrl(): string {
  return '/projects';
}

/**
 * Build a feature page URL.
 */
export function buildFeatureUrl(feature: string): string {
  return `/${feature}`;
}
