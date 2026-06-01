// Centralized normalization helpers for consistent display & matching.

const STREAMS = ["G1", "G2", "G22", "Blue", "Sciences", "Commercials", "Arts"];

/** Title-case a person's name: "john   doe" -> "John Doe". Preserves hyphens & apostrophes. */
export function titleCaseName(input?: string | null): string {
  if (!input) return "";
  return String(input)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .split(" ")
    .map((w) =>
      w
        .split("-")
        .map((p) =>
          p
            .split("'")
            .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
            .join("'")
        )
        .join("-")
    )
    .join(" ");
}

/** Normalize a Form value: "form2", "FORM 2", "2" -> "Form 2". */
export function normalizeForm(input?: string | null): string {
  if (input === null || input === undefined) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const m = raw.match(/(\d+)/);
  return m ? `Form ${m[1]}` : raw;
}

/** Normalize a Stream value to canonical casing (G1, Blue, Sciences, …). */
export function normalizeStream(input?: string | null): string {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  const hit = STREAMS.find((s) => s.toLowerCase() === lower);
  if (hit) return hit;
  // Title-case unknown streams as a fallback
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

/** "Form 2 Blue" from a profile-like object. */
export function formatClass(p?: { form?: string | null; stream?: string | null } | null): string {
  if (!p) return "—";
  const f = normalizeForm(p.form);
  const s = normalizeStream(p.stream);
  if (!f && !s) return "—";
  return [f, s].filter(Boolean).join(" ");
}

/** Normalize a registration number for matching: trim, uppercase, strip spaces/dashes. */
export function normalizeRegNo(input?: string | null): string {
  if (!input) return "";
  return String(input).trim().toUpperCase().replace(/[\s-]+/g, "");
}

/** Loose key for fuzzy name match: lowercase, collapse whitespace, strip punctuation. */
export function nameKey(input?: string | null): string {
  if (!input) return "";
  return String(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein distance for fuzzy matching. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(
        dp[i] + 1,
        dp[i - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[a.length];
}

/** Find best fuzzy match from candidates. Returns null if no candidate within threshold. */
export function bestFuzzyMatch<T>(
  query: string,
  candidates: T[],
  getKey: (c: T) => string,
  maxDistance = 2
): T | null {
  const q = nameKey(query);
  if (!q) return null;
  let best: { item: T; dist: number } | null = null;
  for (const c of candidates) {
    const k = nameKey(getKey(c));
    if (!k) continue;
    if (k === q) return c;
    const d = levenshtein(q, k);
    if (d <= maxDistance && (!best || d < best.dist)) best = { item: c, dist: d };
  }
  return best?.item ?? null;
}
