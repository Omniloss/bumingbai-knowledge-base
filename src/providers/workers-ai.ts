import { z } from "zod";

const WorkersAiResponseSchema = z.object({
  success: z.literal(true),
  result: z.object({
    data: z.array(z.array(z.number().finite())),
    shape: z.array(z.number().int().nonnegative()).optional(),
  }),
});

export type WorkersAiClientOptions = {
  accountId?: string;
  fetcher?: typeof fetch;
  token?: string;
};

export class WorkersAiConfigurationError extends Error {
  constructor(readonly status: 401 | 403) {
    super(`Workers AI configuration error: ${status}`);
    this.name = "WorkersAiConfigurationError";
  }
}

function hasCredentials(
  accountId: string | undefined,
  token: string | undefined,
): accountId is string {
  return (
    accountId !== undefined &&
    token !== undefined &&
    accountId.trim().length > 0 &&
    token.trim().length > 0
  );
}

function validVectors(vectors: number[][], expectedCount: number): boolean {
  if (vectors.length !== expectedCount) return false;
  const first = vectors[0];
  if (first === undefined || first.length === 0) return false;
  return vectors.every(
    (vector) => vector.length === first.length && vector.length > 0,
  );
}

export class WorkersAiClient {
  private readonly accountId: string | undefined;
  private readonly fetcher: typeof fetch;
  private readonly token: string | undefined;

  constructor(options: WorkersAiClientOptions = {}) {
    this.accountId = options.accountId;
    this.token = options.token;
    this.fetcher = options.fetcher ?? fetch;
  }

  async embed(text: readonly string[]): Promise<number[][]> {
    if (text.length === 0) return [];

    const {
      CLOUDFLARE_ACCOUNT_ID: environmentAccountId,
      CLOUDFLARE_API_TOKEN: environmentToken,
    } = process.env;
    const accountId = this.accountId ?? environmentAccountId;
    const token = this.token ?? environmentToken;
    if (!hasCredentials(accountId, token)) return [];

    let response: Response;
    try {
      response = await this.fetcher(
        `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/@cf/qwen/qwen3-embedding-0.6b`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        },
      );
    } catch {
      return [];
    }

    if (response.status === 401 || response.status === 403) {
      throw new WorkersAiConfigurationError(response.status);
    }
    if (!response.ok) return [];

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      return [];
    }

    const parsed = WorkersAiResponseSchema.safeParse(payload);
    if (
      !parsed.success ||
      !validVectors(parsed.data.result.data, text.length)
    ) {
      return [];
    }
    return parsed.data.result.data;
  }
}
