// The one-use server of `atlas remote login` (ADR-0033, point 2;
// `docs/api.md` §4.2): **only on `127.0.0.1`, on the port the system
// chooses**, open only while the attempt lasts. A request whose `state` is not
// the console's **is ignored and the port keeps waiting** — a page of another
// site cannot close it with a guess (mutant 22). The page it serves loads
// nothing and says nothing to anybody (`no-referrer`, a CSP of `none`).

import { createServer } from "node:http";

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; base-uri 'none'; form-action 'none'",
  "x-content-type-options": "nosniff",
};

const page = (title: string, text: string): string =>
  `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${title}</title></head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

export interface Loopback {
  readonly port: number;
  /** The code of the return whose `state` is the console's; rejects when the attempt times out. */
  readonly code: Promise<string>;
  close(): void;
}

export const openLoopback = async (state: string, timeoutMs: number): Promise<Loopback> => {
  let resolveCode: (code: string) => void = () => undefined;
  let rejectCode: (error: Error) => void = () => undefined;
  const code = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    const got = url.searchParams.get("code");
    if (
      request.method !== "GET" ||
      url.pathname !== "/callback" ||
      url.searchParams.get("state") !== state ||
      got === null ||
      got === ""
    ) {
      response.writeHead(400, PAGE_HEADERS);
      response.end(
        page(
          "Este no es el intento",
          "La consola sigue esperando la vuelta de su inicio de sesión.",
        ),
      );
      return;
    }
    response.writeHead(200, PAGE_HEADERS);
    response.end(page("Listo", "Ya puedes cerrar esta pestaña y volver a la consola."));
    resolveCode(got);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const timer = setTimeout(() => rejectCode(new Error("loopback_timeout")), timeoutMs);
  const close = (): void => {
    clearTimeout(timer);
    server.close();
    server.closeIdleConnections();
  };
  code.then(close, close);
  const address = server.address();
  return { port: typeof address === "object" && address !== null ? address.port : 0, code, close };
};
