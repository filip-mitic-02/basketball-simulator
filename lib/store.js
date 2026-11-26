import { sql } from './db.js';

const toRow = r => r && ({
  id: r.id, comp: r.comp || 'nba', simVersion: r.sim_version, secret: r.secret, hard: r.hard, eraFrom: r.era_from, eraTo: r.era_to, spins: r.spins, skips: r.skips,
  curTeam: r.cur_team, picks: r.picks, seasonSeed: r.season_seed == null ? null : Number(r.season_seed), status: r.status, attempts: r.attempts
});

export const pgStore = {
  async countDraftsSince(userId, sec) { const r = await sql()`select count(*)::int as n from drafts where user_id = ${userId} and created_at > now() - make_interval(secs => ${sec})`; return r[0].n; },
  async countRunsSince(userId, sec) { const r = await sql()`select count(*)::int as n from runs where user_id = ${userId} and created_at > now() - make_interval(secs => ${sec})`; return r[0].n; },
  async voidOpen(userId) { await sql()`update drafts set status = 'void' where user_id = ${userId} and status in ('open', 'drafted')`; },
  async insertDraft(d) {
    const r = await sql()`insert into drafts (user_id, comp, sim_version, secret, hard, era_from, era_to) values (${d.userId}, ${d.comp}, ${d.simVersion}, ${d.secret}, ${d.hard}, ${d.eraFrom}, ${d.eraTo}) returning id`;
    return r[0].id;
  },
  async getDraft(id, userId) {
    const r = await sql()`select id, comp, sim_version, secret, hard, era_from, era_to, spins, skips, cur_team, picks, season_seed, status, attempts from drafts where id = ${id} and user_id = ${userId}`;
    return toRow(r[0]);
  },
  // compare-and-swap: only applies if the draft still looks the way the caller read it
  async updateDraft(id, exp, n) {
    const r = await sql()`update drafts set spins = ${n.spins}, skips = ${n.skips}, cur_team = ${n.curTeam}, picks = ${JSON.stringify(n.picks)}::jsonb, season_seed = ${n.seasonSeed}, status = ${n.status}
      where id = ${id} and spins = ${exp.spins} and jsonb_array_length(picks) = ${exp.picksLen} and status = ${exp.status} returning id`;
    return r.length === 1;
  },
  async bumpAttempts(id, max) { await sql()`update drafts set attempts = attempts + 1, status = case when attempts + 1 >= ${max} then 'void' else status end where id = ${id}`; },
  async insertRun(userId, draftId, r) {
    const db = sql();
    try {
      const out = await db.transaction([
        db`insert into runs (user_id, comp, draft_id, wins, losses, po_wins, champion, result, hard, era_from, era_to, era_label, score, roster, achievements, verified, sim_version, log)
           values (${userId}, ${r.comp}, ${draftId}, ${r.wins}, ${r.losses}, ${r.poWins}, ${r.champion}, ${r.result}, ${r.hard}, ${r.eraFrom}, ${r.eraTo}, ${r.eraLabel}, ${r.score},
                   ${JSON.stringify(r.roster)}::jsonb, ${JSON.stringify(r.achievements)}::jsonb, true, ${r.simVersion}, ${JSON.stringify(r.log)}::jsonb)
           returning created_at, wins, losses, result, hard, era_label, score, champion, verified`,
        db`update drafts set status = 'submitted' where id = ${draftId} and user_id = ${userId} and status = 'drafted'`
      ]);
      return out[0][0];
    } catch (e) {
      if (e && e.code === '23505') { const err = new Error('duplicate'); err.status = 409; throw err; }
      throw e;
    }
  }
};
