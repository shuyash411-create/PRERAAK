type RouteHandler = (req: Request, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

export type CallResult<T = Record<string, unknown>> = {
  status: number;
  body: T;
};

/**
 * Invoke a real route handler.
 *
 * Tests go through the exported handler, so every request passes the same
 * guarded() wrapper, the same authorize() call and the same Prisma queries as
 * production. Nothing about authorization is simulated.
 */
export async function call<T = Record<string, unknown>>(
  handler: unknown,
  options: {
    url?: string;
    method?: string;
    body?: unknown;
    params?: Record<string, string>;
    query?: Record<string, string>;
  } = {},
): Promise<CallResult<T>> {
  const method = options.method ?? "GET";
  const url = new URL(options.url ?? "http://localhost:3000/api/test");
  for (const [key, value] of Object.entries(options.query ?? {})) {
    url.searchParams.set(key, value);
  }

  const req = new Request(url, {
    method,
    ...(options.body !== undefined
      ? { body: JSON.stringify(options.body), headers: { "content-type": "application/json" } }
      : {}),
  });

  const response = await (handler as RouteHandler)(req, {
    params: Promise.resolve(options.params ?? {}),
  });

  const text = await response.text();
  let body: unknown = {};
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  return { status: response.status, body: body as T };
}
