/**
 * Bounded Levenshtein edit distance. O(n*m) time and O(min(n,m)) space
 * via a rolling row — fine for short command names against a small pool.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Ensure b is the shorter of the two so the inner loop is small.
  const [s, t] = a.length >= b.length ? [a, b] : [b, a];
  let prev = new Array(t.length + 1);
  let curr = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // delete
        (curr[j - 1] ?? 0) + 1, // insert
        (prev[j - 1] ?? 0) + cost, // substitute
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[t.length] ?? 0;
}

/**
 * Rank a list of candidate names by closeness to `query`. Each score is the
 * edit distance; candidates with a common prefix get a small bonus so
 * `stagi` outranks `prod` against `staging`/`deploy`.
 */
export function fuzzyRank(query: string, candidates: string[]): Array<{ name: string; score: number }> {
  const q = query.toLowerCase();
  return candidates
    .map((name) => {
      const lower = name.toLowerCase();
      const distance = editDistance(q, lower);
      const prefixBonus = lower.startsWith(q) ? -1 : 0;
      return { name, score: distance + prefixBonus };
    })
    .sort((a, b) => a.score - b.score);
}

/**
 * Suggest a close match for a typo'd command. Returns the top candidate when
 * it is within `maxDistance` edits and obviously closer than the runner-up.
 *
 * The default of 2 favors one- and two-character typos over random matches;
 * a 4-edit distance to a 4-letter name is half the word wrong, so a generic
 * hint is the more useful message.
 */
export function suggestCommand(
  typo: string,
  candidates: string[],
  maxDistance = 2,
): string | undefined {
  if (candidates.length === 0 || typo.length === 0) return undefined;
  const ranked = fuzzyRank(typo, candidates);
  const best = ranked[0];
  const second = ranked[1];
  if (!best || best.score > maxDistance) return undefined;
  if (second !== undefined && second.score === best.score) return undefined;
  return best.name;
}
