/**
 * Shared harness for the check scripts.
 *
 * Every script repeated the same pass/fail counter, cookie-jar fetch wrapper,
 * and MCP JSON-RPC caller. Factoring them out keeps each script to the checks
 * it actually owns.
 */
import type { ApiErrorBody } from "../shared/api.js";

export const BASE = process.env.BASE_URL ?? "http://localhost:5173";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accumulates results so a script can exit non-zero on the first failure. */
export class Checks {
  private failures = 0;

  constructor(private readonly title: string) {
    console.log(`\n${title}\n${"-".repeat(60)}`);
  }

  check(label: string, condition: unknown, detail?: string | number): boolean {
    const ok = Boolean(condition);
    if (!ok) this.failures += 1;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${label}${detail !== undefined ? ` -- ${detail}` : ""}`,
    );
    return ok;
  }

  /** Prints the summary and exits with a status the shell can act on. */
  finish(): never {
    console.log("-".repeat(60));
    console.log(
      this.failures === 0
        ? "All checks passed.\n"
        : `${this.failures} check(s) failed.\n`,
    );
    process.exit(this.failures === 0 ? 0 : 1);
  }
}

/** A cookie-jar HTTP client, so a script can hold a session across calls. */
export class ApiClient {
  private cookie = "";

  async call<T = unknown>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<{ status: number; payload: T & Partial<ApiErrorBody> }> {
    const response = await fetch(`${BASE}/api${path}`, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(this.cookie ? { Cookie: this.cookie } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0] ?? this.cookie;

    const text = await response.text();
    let payload: unknown = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }

    return { status: response.status, payload: payload as T & Partial<ApiErrorBody> };
  }

  /** Drops the session, for tenant-isolation checks. */
  clearSession(): void {
    this.cookie = "";
  }

  get sessionCookie(): string {
    return this.cookie;
  }

  set sessionCookie(value: string) {
    this.cookie = value;
  }
}

export interface JsonRpcResponse<T = unknown> {
  result?: T;
  error?: { code: number; message: string };
}

/**
 * Speaks Streamable HTTP to the gateway the way a real MCP client does.
 *
 * A reply is either a JSON object or an SSE stream, and the spec requires
 * clients to accept both -- so this handles either shape.
 */
export async function mcpCall<T = unknown>(
  token: string,
  method: string,
  params: unknown,
  id: number,
): Promise<{ status: number; payload: JsonRpcResponse<T> | null }> {
  const response = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      Authorization: `Bearer ${token}`,
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await response.text();

  if (text.startsWith("event:") || text.includes("\ndata:") || text.startsWith("data:")) {
    const line = text.split("\n").find((l) => l.startsWith("data:"));
    return {
      status: response.status,
      payload: line ? (JSON.parse(line.slice(5).trim()) as JsonRpcResponse<T>) : null,
    };
  }

  return {
    status: response.status,
    payload: text ? (JSON.parse(text) as JsonRpcResponse<T>) : null,
  };
}

/** A unique email, so reruns never collide on the unique constraint. */
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}
