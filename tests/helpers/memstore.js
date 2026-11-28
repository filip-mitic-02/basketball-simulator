import { randomUUID } from 'node:crypto';
// In-memory stand-in for lib/store.js with the same semantics (including compare-and-swap and the one-run-per-draft rule).
export function memStore() {
  const drafts = new Map(), runs = [], users = new Map();
  const usr = u => { if (!users.has(u)) users.set(u, { xp: 0, coins: 0, equipped: {}, owned: [] }); return users.get(u); };
  return {
    drafts, runs, users,
    async countDraftsSince(u) { return [...drafts.values()].filter(d => d.userId === u).length; },
    async countRunsSince(u) { return runs.filter(r => r.userId === u).length; },
    async voidOpen(u) { for (const d of drafts.values()) if (d.userId === u && (d.status === 'open' || d.status === 'drafted')) d.status = 'void'; },
    async insertDraft(d) { const id = randomUUID(); drafts.set(id, { id, ...d, spins: 0, skips: 0, bonus: 0, curTeam: null, picks: [], seasonSeed: null, status: 'open', attempts: 0 }); return id; },
    async getDraft(id, u) { const d = drafts.get(id); return d && d.userId === u ? structuredClone(d) : null; },
    async updateDraft(id, exp, n) {
      const d = drafts.get(id);
      if (!d || d.spins !== exp.spins || d.picks.length !== exp.picksLen || d.status !== exp.status) return false;
      Object.assign(d, structuredClone({ spins: n.spins, skips: n.skips, bonus: n.bonus, curTeam: n.curTeam, picks: n.picks, seasonSeed: n.seasonSeed, status: n.status })); return true;
    },
    async bumpAttempts(id, max) { const d = drafts.get(id); d.attempts++; if (d.attempts >= max) d.status = 'void'; },
    async insertRun(userId, draftId, r) {
      if (runs.some(x => x.draftId === draftId)) { const e = new Error('duplicate'); e.status = 409; throw e; }
      runs.push({ userId, draftId, ...structuredClone(r) });
      const d = drafts.get(draftId); if (d && d.status === 'drafted') d.status = 'submitted';
      const us = usr(userId); us.xp += r.xp; us.coins += r.coins;
      return { xpTotal: us.xp, coinsTotal: us.coins, created_at: new Date(), wins: r.wins, losses: r.losses, result: r.result, hard: r.hard, era_label: r.eraLabel, score: r.score, champion: r.champion, verified: true };
    },
    async getXp(u) { return usr(u).xp; },
    async getProfile(u) { const x = usr(u); return structuredClone(x); },
    async buyItem(u, item, price) { const x = usr(u); if (x.coins < price || x.owned.includes(item)) return false; x.coins -= price; x.owned.push(item); return true; },
    async setEquipped(u, slot, item) { usr(u).equipped[slot] = item; }
  };
}
