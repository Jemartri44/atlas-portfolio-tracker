// Setup of every test file of the web (vitest.config.ts, project `web`): **no
// test goes out to the network** (T1 of the review of PR #90, round 2).
//
// Node and happy-dom both bring a real `fetch`. Under happy-dom it resolves a
// relative URL against `http://localhost:3000` and connects: the card of the
// session in Ajustes asked `GET /api/session` of whatever listened there, and
// a test of the prices failed or passed with the load of the machine. Here it
// is replaced by one that **fails at once**, naming the call. A test that wants an answer simulates it: the code under
// test receives its `fetch` (`readSession`, `signOut`, `SessionCard`), or the
// test stubs the global itself and restores it.

const unsimulated = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = input instanceof Request ? input.url : String(input);
  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  throw new Error(`fetch sin simular en un test: ${method} ${url}`);
}) as typeof fetch;

// Under happy-dom, vitest makes `window` the global object itself, so this
// one assignment covers `window.fetch` too (`no-network.dom.test.ts` holds it).
globalThis.fetch = unsimulated;
