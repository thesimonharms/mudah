/**
 * In-memory fetch double for tests. No sockets — handlers return canned
 * JSON or text by URL string or RegExp.
 *
 * ```ts
 * const net = new NetworkMock();
 * net.on('https://example.com/a.json', { ok: true });
 * const body = await (await net.fetch('https://example.com/a.json')).json();
 * expect(net.calls).toEqual(['https://example.com/a.json']);
 * ```
 */
export interface NetworkMockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export class NetworkMock {
  private readonly routes: Array<{ match: string | RegExp; response: NetworkMockResponse }> = [];
  readonly calls: string[] = [];

  on(url: string | RegExp, body: unknown, status = 200): this {
    this.routes.push({ match: url, response: { status, body } });
    return this;
  }

  reply(url: string | RegExp, response: NetworkMockResponse): this {
    this.routes.push({ match: url, response });
    return this;
  }

  /** `fetch` implementation to inject into code under test. */
  fetch: typeof fetch = async (input, _init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    this.calls.push(url);
    const route = this.routes.find((entry) =>
      typeof entry.match === 'string' ? entry.match === url : entry.match.test(url),
    );
    if (!route) {
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    }
    const status = route.response.status ?? 200;
    const body = route.response.body;
    if (typeof body === 'string' || body instanceof Uint8Array) {
      return new Response(body, { status, headers: route.response.headers });
    }
    return new Response(JSON.stringify(body ?? null), {
      status,
      headers: { 'content-type': 'application/json', ...route.response.headers },
    });
  };
}
