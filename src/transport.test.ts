import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpTransport } from "./transport";

describe("HttpTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a healthy HTTP fallback as connected without WebSocket events", async () => {
    const websocket = vi.fn();
    vi.stubGlobal("WebSocket", websocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { sessions: 3 } }),
    }));

    const transport = new HttpTransport(
      "http://127.0.0.1:53137",
      "ws://127.0.0.1:52131",
      null,
      false,
    );
    const statuses: string[] = [];
    const unlisten = transport.onStatusChange(status => statuses.push(status));

    await expect(transport.invoke("scan_sessions")).resolves.toEqual({ sessions: 3 });

    expect(statuses).toEqual(["connecting", "connected"]);
    expect(transport.isConnected()).toBe(true);
    expect(websocket).not.toHaveBeenCalled();

    unlisten();
    transport.disconnect();
  });
});
