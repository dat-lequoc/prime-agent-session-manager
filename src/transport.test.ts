import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpTransport } from "./transport";

class PendingWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;

  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = PendingWebSocket.CONNECTING;

  close() {
    this.readyState = 3;
  }

  send() {}
}

describe("HttpTransport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a healthy HTTP fallback as connected without WebSocket events", async () => {
    vi.stubGlobal("WebSocket", PendingWebSocket);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { sessions: 3 } }),
    }));

    const transport = new HttpTransport(
      "http://127.0.0.1:53137",
      "ws://127.0.0.1:52131",
    );
    const statuses: string[] = [];
    const unlisten = transport.onStatusChange(status => statuses.push(status));

    await expect(transport.invoke("scan_sessions")).resolves.toEqual({ sessions: 3 });

    expect(statuses).toEqual(["connecting", "connected"]);
    expect(transport.isConnected()).toBe(true);

    unlisten();
    transport.disconnect();
  });
});
