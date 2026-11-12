import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/sync/run", () => ({ runSync: vi.fn().mockResolvedValue({}) }));

import { runSync } from "@/lib/sync/run";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("GET /api/sync", () => {
  it("nega acesso quando o segredo não está configurado", async () => {
    vi.stubEnv("CRON_SECRET", undefined);
    const response = await GET(new Request("https://example.com/api/sync"));
    expect(response.status).toBe(401);
    expect(runSync).not.toHaveBeenCalled();
  });

  it("aceita o segredo configurado no header de autorização", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    const response = await GET(new Request("https://example.com/api/sync", {
      headers: { authorization: "Bearer segredo-de-teste" },
    }));
    expect(response.status).toBe(200);
    expect(runSync).toHaveBeenCalledOnce();
  });
});
