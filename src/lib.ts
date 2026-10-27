export const errMsg = (e: unknown) => (typeof e === "string" ? e : String(e));

/** "src/a/b.ts" -> ["src/a/", "b.ts"] */
export function splitPath(p: string): [string, string] {
  const i = p.lastIndexOf("/");
  return i < 0 ? ["", p] : [p.slice(0, i + 1), p.slice(i + 1)];
}

export const shortPath = (p: string) => p.replace(/^\/home\/[^/]+/, "~");

export function relTime(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [30, "d"],
    [12, "mo"],
  ];
  let n = s;
  for (const [step, label] of units) {
    if (n < step) return `${Math.floor(n)}${label} ago`;
    n /= step;
  }
  return `${Math.floor(n)}y ago`;
}
