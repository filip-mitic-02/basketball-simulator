// Server-side validation of a finished season. The score is ALWAYS recomputed here; the client's number is ignored.
export const ROUNDS = ['First Round', 'Conference Semifinals', 'Conference Finals', 'NBA Finals'];
export const MIN_Y = 1950, MAX_Y = 2100;

const clean = (s, max) => String(s).replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);
const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

export function computeScore({ wins, poWins, champion, hard }) {
  return Math.round((wins * 10 + poWins * 8 + (champion ? 300 : 0) + (wins === 82 ? 1000 : 0)) * (hard ? 1.5 : 1));
}
export function validateRun(b) {
  const bad = m => ({ ok: false, error: m });
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad('body');
  const { w, l, poW, champ, hard, res, eraFrom, eraTo, eraLabel, names, ach } = b;
  if (!isInt(w, 0, 82) || !isInt(l, 0, 82) || w + l !== 82) return bad('record');
  if (!isInt(poW, 0, 16)) return bad('playoff wins');
  if (typeof champ !== 'boolean' || typeof hard !== 'boolean') return bad('flags');
  if (!isInt(eraFrom, MIN_Y, MAX_Y) || !isInt(eraTo, MIN_Y, MAX_Y) || eraTo < eraFrom) return bad('era');
  if (typeof res !== 'string') return bad('result');
  const okRes = res === 'Champion' || res === 'Missed playoffs' || (res.startsWith('Eliminated: ') && ROUNDS.includes(res.slice(12)));
  if (!okRes) return bad('result');
  if ((res === 'Champion') !== champ) return bad('result mismatch');
  if (champ && poW < 16) return bad('champion needs 16 playoff wins');
  if (res === 'Missed playoffs' && poW !== 0) return bad('playoff wins');
  if (res.startsWith('Eliminated: ')) {
    const r = ROUNDS.indexOf(res.slice(12));
    if (poW < r * 4 || poW > r * 4 + 3) return bad('playoff wins vs round');
  }
  if (!Array.isArray(names) || names.length !== 10 || names.some(x => typeof x !== 'string')) return bad('roster');
  if (!Array.isArray(ach) || ach.length > 30 || ach.some(x => typeof x !== 'string')) return bad('achievements');
  const run = {
    wins: w, losses: l, poWins: poW, champion: champ, hard, result: res, eraFrom, eraTo,
    eraLabel: clean(eraLabel == null ? '' : eraLabel, 30),
    roster: names.map(x => clean(x, 60)), achievements: ach.map(x => clean(x, 60))
  };
  run.score = computeScore(run);
  return { ok: true, run };
}
// "Ana Kovacevic" -> "Ana K." (the public leaderboard never shows a full name)
export function publicName(given, family) {
  const g = clean(given || '', 24), f = clean(family || '', 24);
  if (!g) return 'Coach';
  return f ? `${g} ${f[0].toUpperCase()}.` : g;
}
