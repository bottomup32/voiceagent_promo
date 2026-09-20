import { cookies } from "next/headers";

/**
 * A random id the browser keeps, set by `middleware.ts` on the first visit to a
 * demo link. It exists to answer one question the operator actually asks — did
 * three people at this business try it, or one person three times — and it
 * carries nothing else: no name, no address, nothing derived from the visitor.
 *
 * It replaces the IP hash the app used to store, which was a truncated,
 * unsalted SHA-256 of an address and so was reversible by brute force over the
 * IPv4 space, identified the office rather than the person, and was never read
 * by any code.
 */
export const VISITOR_COOKIE = "va_vid";
export const VISITOR_MAX_AGE_SEC = 60 * 60 * 24 * 180;

export async function visitorId(): Promise<string | undefined> {
  return (await cookies()).get(VISITOR_COOKIE)?.value;
}
