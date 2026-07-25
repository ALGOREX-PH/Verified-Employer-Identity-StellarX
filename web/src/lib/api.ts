import { NextResponse } from 'next/server';

/** JSON error response with the given HTTP status. */
export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Best-effort caller IP from the standard proxy header; 'local' outside a proxy. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (!forwarded) return 'local';
  const first = forwarded.split(',')[0]?.trim();
  return first || 'local';
}

/** Accepts only a body shaped like `{ employer: string }` holding a valid G... address. */
export function parseEmployer(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const employer = (body as { employer?: unknown }).employer;
  if (typeof employer !== 'string') return null;
  return /^G[A-Z2-7]{55}$/.test(employer) ? employer : null;
}

/** Horizon errors nest the useful detail under result_codes; fall back to the raw message. */
export function errMessage(e: unknown): string {
  const codes = (e as { response?: { data?: { extras?: { result_codes?: unknown } } } })
    ?.response?.data?.extras?.result_codes;
  if (codes) return JSON.stringify(codes);
  return e instanceof Error ? e.message : String(e);
}

/**
 * One structured, single-line log per request.
 * NEVER log secrets, request bodies, or signed XDRs.
 */
export function logRoute(
  route: string,
  employer: string,
  outcome: string,
  startedAt: number,
): void {
  console.log(JSON.stringify({ route, employer, outcome, ms: Date.now() - startedAt }));
}
