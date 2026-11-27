"""Honors-anchored rating calibration (run after prep.py / prep_el.py).

Box-score Game Score alone under-rates players whose value is role/defence/playmaking/winning and
systematically deflates the early eras (All-NBA 1st-team members averaged ~73 in the 50s-60s vs ~82 now).
This pass anchors each player-season to independent honors (All-NBA, All-Defensive, MVP, DPOY;
All-EuroLeague, EL MVP) while keeping the stat-based order inside each tier, and softly caps
stat-only outliers that earned no recognition.  Idempotent: the raw prep.py/prep_el.py rating is kept in
data/honors/base_ovr_*.json on first run and every later run recomputes from it.

usage: python3 scripts/apply_honors.py [--dry]
"""
import json, os, sys, collections, statistics as S
sys.path.insert(0, os.path.dirname(__file__))
import honors_lib as hl

ROOT = os.path.join(os.path.dirname(__file__), '..')
DRY = '--dry' in sys.argv

# (floor, keep) : a player below the floor ends at floor - keep*(floor - raw); above the floor is untouched.
NBA_RULES = {'MVP': (90, .25), 'DPOY': (80, .30), 'A1': (82, .25), 'A2': (77, .30), 'A3': (73, .35), 'D1': (72, .40), 'D2': (68, .45)}
EL_RULES = {'MVP': (84, .25), 'E1': (78, .30), 'E2': (73, .35)}
NBA_CAP = (82, .5)      # no honor, >=50 games: ratings above 82 are halved
EL_CAP = (80, .5)       # no honor, >=20 games, season with awards

def calibrate(raw, tags, g, rules, cap, awarded, cap_g):
    new = raw
    for t in tags:
        r = rules.get(t)
        if r and raw < r[0]:
            new = max(new, r[0] - r[1] * (r[0] - raw))
    if not tags and awarded and g >= cap_g and raw > cap[0]:
        new = cap[0] + cap[1] * (raw - cap[0])
    return int(round(min(99, max(28, new))))

def run(comp):
    path = os.path.join(ROOT, 'public', 'data.json' if comp == 'nba' else 'data-el.json')
    base_path = os.path.join(ROOT, 'data', 'honors', f'base_ovr_{comp}.json')
    d = json.load(open(path, encoding='utf8'))
    F = d['fields']; io = F.index('ovr'); ig = F.index('g')
    if 'hon' not in F:
        F.append('hon')
        for t in d['teams']:
            for p in t[4]: p.append('')
    ih = F.index('hon')
    H = hl.load_nba() if comp == 'nba' else hl.load_el()
    rules, cap = (NBA_RULES, NBA_CAP) if comp == 'nba' else (EL_RULES, EL_CAP)
    cap_g = 50 if comp == 'nba' else 20
    if os.path.exists(base_path):
        base = json.load(open(base_path))
    else:
        base = {f'{t[0]}|{p[0]}': p[io] for t in d['teams'] for p in t[4]}
        if not DRY: json.dump(base, open(base_path, 'w'), separators=(',', ':'), ensure_ascii=False)
    awarded = {y for (y, _) in H}
    if comp == 'nba': awarded |= set(range(1950, 2027))
    changed = collections.Counter(); delta = []
    for t in d['teams']:
        yr = t[1]
        for p in t[4]:
            raw = base[f'{t[0]}|{p[0]}']
            tags = H.get((yr, hl.norm(p[0])), set())
            if comp == 'el' and yr not in awarded: tags = set()
            new = calibrate(raw, tags, p[ig], rules, cap, (yr in awarded and yr not in (2019, 2026)) if comp == 'el' else True, cap_g)
            if new != p[io]: changed[yr // 10 * 10] += 1
            delta.append(new - raw)
            p[io] = new
            p[ih] = ','.join(sorted(tags))
    print(comp, 'changed rows', sum(changed.values()), dict(sorted(changed.items())), 'mean delta', round(S.mean(delta), 2))
    if not DRY: json.dump(d, open(path, 'w'), separators=(',', ':'), ensure_ascii=False)

if __name__ == '__main__':
    for c in ('nba', 'el'): run(c)
