import { describe, expect, it, vi } from "vitest";
import {
  WorkersAiClient,
  WorkersAiConfigurationError,
} from "../../src/providers/workers-ai.js";

type CapturedRequest = {
  init: RequestInit | undefined;
  url: URL;
};

function clientWithResponse(response: Response): WorkersAiClient {
  const fetcher: typeof fetch = async () => response;
  return new WorkersAiClient({
    accountId: "account id",
    token: "test-token",
    fetcher,
  });
}

describe("WorkersAiClient", () => {
  it("posts the documented embedding request and parses vectors", async () => {
    const requests: CapturedRequest[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        init,
        url: new URL(input instanceof Request ? input.url : input.toString()),
      });
      return Response.json({
        success: true,
        result: {
          data: [
            [0.1, 0.2],
            [0.3, 0.4],
          ],
          shape: [2, 2],
        },
      });
    };
    const client = new WorkersAiClient({
      accountId: "account id",
      token: "test-token",
      fetcher,
    });

    await expect(client.embed(["first", "second"])).resolves.toEqual([
      [0.1, 0.2],
      [0.3, 0.4],
    ]);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url.toString()).toBe(
      "https://api.cloudflare.com/client/v4/accounts/account%20id/ai/run/@cf/qwen/qwen3-embedding-0.6b",
    );
    expect(requests[0]?.init?.method).toBe("POST");
    expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toBe(
      "Bearer test-token",
    );
    expect(new Headers(requests[0]?.init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
    expect(requests[0]?.init?.body).toBe(
      JSON.stringify({ text: ["first", "second"] }),
    );
  });

  it("uses current environment credentials when they are available", async () => {
    const requests: CapturedRequest[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      requests.push({
        init,
        url: new URL(input instanceof Request ? input.url : input.toString()),
      });
      return Response.json({ success: true, result: { data: [[1]] } });
    };
    const client = new WorkersAiClient({ fetcher });
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "environment-account");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "environment-token");

    try {
      await expect(client.embed(["text"])).resolves.toEqual([[1]]);
      expect(requests[0]?.url.toString()).toBe(
        "https://api.cloudflare.com/client/v4/accounts/environment-account/ai/run/@cf/qwen/qwen3-embedding-0.6b",
      );
      expect(new Headers(requests[0]?.init?.headers).get("Authorization")).toBe(
        "Bearer environment-token",
      );
      expect(requests[0]?.init?.body).toBe(JSON.stringify({ text: ["text"] }));
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("skips fetches for missing credentials and empty input", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "");

    try {
      await expect(
        new WorkersAiClient({ fetcher }).embed(["text"]),
      ).resolves.toEqual([]);
      await expect(
        new WorkersAiClient({
          accountId: "account",
          token: "token",
          fetcher,
        }).embed([]),
      ).resolves.toEqual([]);
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.each([
    401, 403,
  ])("raises a safe configuration error for %i", async (status) => {
    const error = await clientWithResponse(
      new Response("super-secret-token response-private-material", { status }),
    )
      .embed(["text"])
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );

    expect(error).toBeInstanceOf(WorkersAiConfigurationError);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error))
      throw new Error("Expected configuration error");
    expect(error.message).toBe(`Workers AI configuration error: ${status}`);
    expect(error.message).not.toContain("super-secret-token");
    expect(error.message).not.toContain("response-private-material");
    expect(error.message).not.toContain("Authorization");
    expect(error.message).not.toContain("test-token");
  });

  it.each([
    429, 500,
  ])("returns no vectors for non-auth HTTP %i", async (status) => {
    await expect(
      clientWithResponse(
        new Response("temporarily unavailable", { status }),
      ).embed(["text"]),
    ).resolves.toEqual([]);
  });

  it("returns no vectors when the request fails on the network", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("network unavailable");
    };

    await expect(
      new WorkersAiClient({
        accountId: "account",
        token: "token",
        fetcher,
      }).embed(["text"]),
    ).resolves.toEqual([]);
  });

  it.each([
    Response.json({ success: false }),
    new Response("not json", { status: 200 }),
    Response.json({ success: true, result: { data: "not vectors" } }),
  ])("returns no vectors for unsuccessful or malformed payloads", async (response) => {
    await expect(clientWithResponse(response).embed(["text"])).resolves.toEqual(
      [],
    );
  });

  it.each([
    { data: [[0.1, 0.2]] },
    { data: [[0.1, 0.2], [0.3]] },
    { data: [[], []] },
  ])("returns no vectors for invalid vector dimensions", async ({ data }) => {
    await expect(
      clientWithResponse(
        Response.json({ success: true, result: { data } }),
      ).embed(["first", "second"]),
    ).resolves.toEqual([]);
  });
});
