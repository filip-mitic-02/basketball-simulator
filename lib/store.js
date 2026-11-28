import { sql } from './db.js';

const toRow = r => r && ({
  id: r.id, comp: r.comp || 'nba', simVersion: r.sim_version, secret: r.secret, hard: r.hard, eraFrom: r.era_from, eraTo: r.era_to, spins: r.spins, skips: r.skips, bonus: r.bonus || 0,
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
    const r = await sql()`select id, comp, sim_version, secret, hard, era_from, era_to, spins, skips, bonus, cur_team, picks, season_seed, status, attempts from drafts where id = ${id} and user_id = ${userId}`;
    return toRow(r[0]);
  },
  // compare-and-swap: only applies if the draft still looks the way the caller read it
  async updateDraft(id, exp, n) {
    const r = await sql()`update drafts set spins = ${n.spins}, skips = ${n.skips}, bonus = ${n.bonus}, cur_team = ${n.curTeam}, picks = ${JSON.stringify(n.picks)}::jsonb, season_seed = ${n.seasonSeed}, status = ${n.status}
      where id = ${id} and spins = ${exp.spins} and jsonb_array_length(picks) = ${exp.picksLen} and status = ${exp.status} returning id`;
    return r.length === 1;
  },
  async bumpAttempts(id, max) { await sql()`update drafts set attempts = attempts + 1, status = case when attempts + 1 >= ${max} then 'void' else status end where id = ${id}`; },
  async insertRun(userId, draftId, r) {
    const db = sql();
    try {
      const out = await db.transaction([
        db`insert into runs (user_id, comp, draft_id, wins, losses, po_wins, champion, result, hard, era_from, era_to, era_label, score, roster, achievements, verified, sim_version, log, xp)
           values (${userId}, ${r.comp}, ${draftId}, ${r.wins}, ${r.losses}, ${r.poWins}, ${r.champion}, ${r.result}, ${r.hard}, ${r.eraFrom}, ${r.eraTo}, ${r.eraLabel}, ${r.score},
                   ${JSON.stringify(r.roster)}::jsonb, ${JSON.stringify(r.achievements)}::jsonb, true, ${r.simVersion}, ${JSON.stringify(r.log)}::jsonb, ${r.xp})
           returning created_at, wins, losses, result, hard, era_label, score, champion, verified`,
        db`update drafts set status = 'submitted' where id = ${draftId} and user_id = ${userId} and status = 'drafted'`,
        db`update users set xp = xp + ${r.xp}, coins = coins + ${r.coins} where id = ${userId} returning xp, coins`
      ]);
      return { ...out[0][0], xpTotal: out[2][0].xp, coinsTotal: out[2][0].coins };
    } catch (e) {
      if (e && e.code === '23505') { const err = new Error('duplicate'); err.status = 409; throw err; }
      throw e;
    }
  },
  async getXp(userId) { const r = await sql()`select xp from users where id = ${userId}`; return r[0] ? r[0].xp : 0; },
  async getProfile(userId) {
    const db = sql();
    const [u, it] = await Promise.all([db`select xp, coins, equipped from users where id = ${userId}`, db`select item from user_items where user_id = ${userId}`]);
    return u[0] ? { xp: u[0].xp, coins: u[0].coins, equipped: u[0].equipped || {}, owned: it.map(x => x.item) } : null;
  },
  // Atomic: spends the coins and adds the item in one statement, only if the user can afford it and does not own it yet.
  async buyItem(userId, item, price) {
    const r = await sql()`with u as (update users set coins = coins - ${price} where id = ${userId} and coins >= ${price}
        and not exists (select 1 from user_items where user_id = ${userId} and item = ${item}) returning id)
      insert into user_items (user_id, item) select id, ${item} from u returning item`;
    return r.length === 1;
  },
  async setEquipped(userId, slot, item) { await sql()`update users set equipped = jsonb_set(equipped, array[${slot}], to_jsonb(${item}::text)) where id = ${userId}`; }
};
