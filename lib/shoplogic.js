// Shop: buy and equip cosmetics. Prices and slots come from the shared catalog (public/progress.js); the client only names an item.
import { loadProgress } from './sim.js';
import { ApiError } from './draftlogic.js';

export async function opShop(store, userId, b) {
  const P = loadProgress();
  if (!b || typeof b.item !== 'string') throw new ApiError(400, 'item');
  const it = P.byId[b.item]; if (!it) throw new ApiError(400, 'item');
  const pr = await store.getProfile(userId); if (!pr) throw new ApiError(401, 'auth');
  const owned = id => P.byId[id] && (P.byId[id].price === 0 || pr.owned.includes(id));
  if (b.op === 'buy') {
    if (it.price === 0 || pr.owned.includes(it.id)) throw new ApiError(409, 'owned');
    if (pr.coins < it.price) throw new ApiError(402, 'coins');
    if (!(await store.buyItem(userId, it.id, it.price))) throw new ApiError(409, 'conflict');
  } else if (b.op === 'equip') {
    if (!owned(it.id)) throw new ApiError(403, 'not owned');
    await store.setEquipped(userId, it.slot, it.id);
  } else throw new ApiError(400, 'op');
  const n = await store.getProfile(userId);
  return { prog: { ...P.stateOf(n.xp), coins: n.coins, owned: n.owned, equipped: n.equipped } };
}
