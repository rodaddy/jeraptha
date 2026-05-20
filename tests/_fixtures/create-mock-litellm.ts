interface ContradictionResult {
  contradicts: boolean;
  detail: string;
}

interface MockFetchOptions {
  defaultResult?: ContradictionResult;
  shouldFail?: boolean;
  failureMessage?: string;
  latencyMs?: number;
}

export function createMockLiteLLM(options: MockFetchOptions = {}) {
  const {
    defaultResult = { contradicts: false, detail: "" },
    shouldFail = false,
    failureMessage = "LiteLLM unreachable",
  } = options;

  const calls: Array<{ url: string; body: any }> = [];

  const mockFetch = async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, body });

    if (shouldFail) {
      throw new Error(failureMessage);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify(defaultResult),
            },
          },
        ],
      }),
    };
  };

  return {
    fetch: mockFetch as typeof globalThis.fetch,
    calls,
    setResult(result: ContradictionResult) {
      (options as any).defaultResult = result;
    },
  };
}
