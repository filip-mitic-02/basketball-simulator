# Builds public/data-el.json (EuroLeague team-seasons) from data/euroleague/players.csv (see scripts/fetch-euroleague.mjs).
# Same rating model as scripts/prep.py (NBA), adapted: positions are derived from the stat line, thresholds scale with games played,
# and seasons made of only a first stage (10 to 14 games before 2016) are shrunk a little more towards the mean.
import pandas as pd, numpy as np, json, os, re
d = pd.read_csv('data/euroleague/players.csv')
d = d[~d.Tm.str.contains(';', na=False)].copy()          # mid-season movers appear only as one combined row: dropped
d = d[(d.G > 0) & (d.MP > 0)].copy()
def tok(w):
    if '-' in w: return '-'.join(tok(x) for x in w.split('-'))
    if "'" in w: return "'".join(tok(x) for x in w.split("'"))
    if not re.search('[AEIOUY]', w) and len(w) <= 3: return w                       # TJ, JR, DJ
    if w.startswith('MC') and len(w) > 3: return 'Mc' + w[2:3] + w[3:].lower()
    return w[:1] + w[1:].lower()
def nice(s):
    p = [x.strip() for x in s.split(',')]
    full = (p[1] + ' ' + p[0]) if len(p) == 2 and p[1] else p[0]
    return ' '.join(tok(w) for w in full.split())
d['Player'] = d.Player.map(nice)
d['FG'] = d['2P'] + d['3P']; d['FGA'] = d['2PA'] + d['3PA']
d['FG%'] = d.FG / d.FGA.clip(lower=1); d['3P%'] = d['3P'] / d['3PA'].clip(lower=1); d['FT%'] = d.FT / d.FTA.clip(lower=1)
d['tg'] = d.groupby(['Season', 'Tm']).G.transform('max')
d['sc'] = np.sqrt(34.0 / d.tg).clip(0.8, 1.8)               # sample-size boost: short first stages count for a bit less
d['hasdef'] = True; d['TOVm'] = False; d['limited'] = False
d['PF'] = d.PF.fillna(d.G * 2.5)
mpe = d.MP.clip(lower=1)
# ---- league baselines per season (minutes weighted)
def lg(g):
    mp = g.MP.sum(); fga = g.FGA.sum(); fta = g.FTA.sum()
    return pd.Series(dict(mp=mp, p2=g['2P'].sum() / max(1, g['2PA'].sum()), p3=g['3P'].sum() / max(1, g['3PA'].sum()), r3=g['3PA'].sum() / fga,
        ft=g.FT.sum() / max(1, fta), ftr=fta / fga, tovr=g.TOV.sum() / (fga + .44 * fta + g.TOV.sum()), u36=(fga + .44 * fta + g.TOV.sum()) / mp * 36,
        ast36=g.AST.sum() / mp * 36, orb36=g.ORB.sum() / mp * 36, drb36=g.DRB.sum() / mp * 36, stl36=g.STL.sum() / mp * 36, blk36=g.BLK.sum() / mp * 36, pf36=g.PF.sum() / mp * 36))
L = d.groupby('Season').apply(lg)
d = d.join(L, on='Season', rsuffix='_lg')
mp = d.MP.clip(lower=1)
# ---- positions from the stat line (the API has none): size index from rebounding, blocks, passing
for c, b in [('TRB', 'trb36'), ('BLK', 'blk36x'), ('AST', 'ast36x'), ('STL', 'stl36x')]: d[b] = d[c] / mp * 36
d['ast36'] = d['ast36']  # league
def z(col):
    ref = d[d.MP >= 10 * d.tg]
    g = ref.groupby('Season')[col]
    return (d[col] - d.Season.map(g.mean())) / d.Season.map(g.std())
d['size'] = 0.9 * z('trb36') + 0.7 * z('blk36x') - 1.0 * z('ast36x') - 0.35 * z('stl36x')
ok = d.MP >= 10 * d.tg
d['pr'] = np.nan
d.loc[ok, 'pr'] = d[ok].groupby('Season')['size'].rank(pct=True)
d['pr'] = d.pr.fillna(d.groupby('Season')['size'].rank(pct=True))
astz = z('ast36x')
d['az'] = astz
gm = d[d.pr < .40].groupby('Season').az.median()
d['gmed'] = d.Season.map(gm)
def posof(r, a):
    p = r.pr
    if p < .40: base = 'PG' if a > r.gmed else 'SG'
    elif p < .60: base = 'SF'
    elif p < .80: base = 'PF'
    else: base = 'C'
    if .37 <= p < .43: return base, ('G-F' if base in ('PG', 'SG') else base)
    if .77 <= p < .83: return base, 'F-C'
    return base, base
pp = [posof(r, a) for r, a in zip(d.itertuples(), astz)]
d['Pos'] = [x[0] for x in pp]; d['PosH'] = [x[1] for x in pp]
# ---- regressed rates (same constants as the NBA build, minutes scaled by the sample boost)
mps = mp * d.sc
d['P2'] = (d['2P'] + 200 * d.p2) / (d['2PA'] + 200)
d['P3'] = (d['3P'] + 150 * d.p3) / (d['3PA'] + 150)
d['FTP'] = (d.FT + 100 * d.ft) / (d.FTA + 100)
d['R3'] = d['3PA'] / d.FGA.clip(lower=1)
d['FTR'] = ((d.FTA + 15 * d.ftr) / (d.FGA + 15)) / d.ftr
d['USG'] = ((d.FGA + .44 * d.FTA + d.TOV) / mp * 36) / d.u36
poss = d.FGA + .44 * d.FTA + d.TOV
d['TOVR'] = (((d.TOV + 40 * d.tovr) / (poss + 40)) / d.tovr).clip(0.5, 2.0)
d['AST_'] = d.AST / mp * 36 / d.ast36; d['ORB_'] = d.ORB / mp * 36 / d.orb36; d['DRB_'] = d.DRB / mp * 36 / d.drb36
d['STL_'] = d.STL / mp * 36 / d.stl36; d['BLK_'] = d.BLK / mp * 36 / d.blk36
d['posg'] = d.Pos.map({'PG': 'G', 'SG': 'G', 'SF': 'F', 'PF': 'F', 'C': 'C'})
for c, k in [('AST_', 300), ('ORB_', 250), ('DRB_', 250), ('STL_', 500), ('BLK_', 500)]:
    pm = d.groupby('posg')[c].transform('mean'); d[c] = (d[c] * mps + pm * k) / (mps + k)
d['PF_'] = (((d.PF / mp * 36) / d.pf36) * mps + 300) / (mps + 300)
d['PF_'] = d.PF_.clip(0.5, 1.8)
# ---- OVR: era-normalised game score per 36, same recipe as the NBA build
gs = (d.PTS + .4 * d.FG - .7 * d.FGA - .4 * (d.FTA - d.FT) + .7 * d.ORB + .3 * d.DRB + d.STL + .7 * d.AST + .7 * d.BLK - .4 * d.PF - d.TOV) / mp * 36
d['gs'] = gs
ref = d[d.MP >= 10 * d.tg]
mu = ref.groupby('Season').apply(lambda x: np.average(x.gs, weights=x.MP)).rename('gmu')
sd = ref.groupby('Season').apply(lambda x: np.sqrt(np.average((x.gs - np.average(x.gs, weights=x.MP)) ** 2, weights=x.MP))).rename('gsd')
d = d.join(mu, on='Season').join(sd, on='Season')
zz = (d.gs - d.gmu) / d.gsd
w = mps / (mps + 350) * np.minimum(1.0, np.sqrt(d.G / 20.0))      # short first-stage seasons (10 to 14 games) are trusted less
zs = zz * w + (-0.9) * (1 - w)
# Volume and role: the per-36 game score alone rates an efficient 20-minute big above a 28-minute star. Blend in a per-game production z
# (points, rebounds, assists, steals, blocks, same weights as the NBA build), then rescale so the spread of rotation players is unchanged.
prod = (d.PTS + 1.5 * d.TRB + 1.5 * d.AST + 2.2 * d.STL + 2.5 * d.BLK) / d.G
rot = (d.MP >= 12 * d.tg) & (d.G >= 0.4 * d.tg)
pmu = prod[rot].groupby(d.Season[rot]).mean(); psd = prod[rot].groupby(d.Season[rot]).std()
prz = ((prod - d.Season.map(pmu)) / d.Season.map(psd)) * w + (-0.9) * (1 - w)
zb = 0.65 * zs + 0.35 * prz
rt = (d.MP / d.G >= 15) & (d.G >= 0.4 * d.tg)
zb = (zb - zb[rt].mean()) / zb[rt].std() * zs[rt].std() + zs[rt].mean()
zs = zb
zs = zs + 0.18 * (((mp / d.G) - 22) / 8).clip(-1.5, 1.5)
d['ovr'] = (61 + 14.6 * zs).round().clip(28, 99)      # wider than the NBA constant so the EuroLeague talent spread matches the NBA scale the engine is tuned for
# ---- rosters: the 13 busiest players of each team-season
d['rk'] = d.groupby(['Season', 'Tm']).MP.rank(ascending=False, method='first')
r = d[d.rk <= 13]
r = r[(r.MP >= 5 * r.tg) | (r.rk <= 8)]
cnt = r.groupby(['Season', 'Tm']).size()
keep = cnt[(cnt >= 8) & (r.groupby(['Season', 'Tm']).tg.max() >= 8)].index
r = r.set_index(['Season', 'Tm']).loc[keep].reset_index()
# ---- clean club names (the API uses sponsor names that change every year)
CLEAN = {'Crvena Zvezda': 'Crvena Zvezda', 'Partizan': 'Partizan', 'Real Madrid': 'Real Madrid', 'FC Barcelona': 'Barcelona', 'Olympiacos': 'Olympiacos', 'Panathinaikos': 'Panathinaikos',
  'Fenerbahce': 'Fenerbahce', 'Anadolu Efes': 'Anadolu Efes', 'Maccabi': 'Maccabi Tel Aviv', 'Baskonia': 'Baskonia', 'Zalgiris': 'Zalgiris', 'CSKA': 'CSKA Moscow', 'Olimpia Milan': 'Olimpia Milano',
  'Milano': 'Olimpia Milano', 'Virtus': 'Virtus Bologna', 'ASVEL': 'ASVEL', 'ALBA': 'ALBA Berlin', 'Bayern': 'Bayern Munich', 'Monaco': 'Monaco', 'Valencia': 'Valencia', 'Unicaja': 'Unicaja', 'Paris': 'Paris',
  'Khimki': 'Khimki', 'Darussafaka': 'Darussafaka', 'Buducnost': 'Buducnost', 'Cibona': 'Cibona', 'Cedevita': 'Cedevita', 'Lietuvos': 'Rytas', 'Rytas': 'Rytas', 'Dinamo': 'Dinamo Sassari', 'Brose': 'Brose Bamberg', 'Dubai': 'Dubai', 'Hapoel': 'Hapoel Tel Aviv'}
def clean(n):
    for k, v in CLEAN.items():
        if k.lower() in n.lower(): return v
    return re.sub(r'\b(KK|BC|B\.C\.|Basketball|GmbH|SS|Club)\b', '', n).replace('  ', ' ').strip()
names = d.groupby(['Season', 'Tm']).TmName.agg(lambda s: s.value_counts().index[0])
def R(x, n=3): return round(float(x), n)
teams = []
for (s, tm), g in r.groupby(['Season', 'Tm']):
    g = g.sort_values('MP', ascending=False); pl = []
    for _, x in g.iterrows():
        G = x.G
        pl.append([x.Player, x.PosH if x.PosH in ('G-F', 'F-C') else x.Pos, int(x.Age) if x.Age == x.Age else 0, int(G), R(x.MP / G, 1), R(x.PTS / G, 1), R(x.TRB / G, 1), R(x.AST / G, 1), R(x.STL / G, 1), R(x.BLK / G, 1),
           R(x['FG%'], 3), R(x['3P%'], 3) if x['3PA'] >= 10 else None, R(x['FT%'], 3), int(x.ovr), R(x.USG, 2), R(x.P2 - x.p2, 3), R(x.P3 - x.p3, 3), R(x.R3, 2), R(x.FTP, 3), R(x.FTR, 2), R(x.TOVR, 2),
           R(x.AST_, 2), R(x.ORB_, 2), R(x.DRB_, 2), R(x.STL_, 2), R(x.BLK_, 2), R(x.PF_, 2), 0,
           {'PG': 'PG', 'SG': 'SG', 'SF': 'SF', 'PF': 'PF', 'C': 'C', 'G-F': 'SG,SF', 'F-C': 'PF,C'}[x.PosH if x.PosH in ('G-F', 'F-C') else x.Pos] if x.Pos not in ('PG',) or x.PosH == 'PG' else 'PG'])
    teams.append([f'{s}-{tm}', int(s), tm, clean(names[(s, tm)]), pl])
fields = ["name", "pos", "age", "g", "mpg", "ppg", "rpg", "apg", "spg", "bpg", "fg", "tp", "ft", "ovr", "usg", "p2", "p3", "r3", "ftp", "ftr", "tov", "ast", "orb", "drb", "stl", "blk", "pf", "lim", "elig"]
json.dump({"_prep": True, "fields": fields, "teams": teams}, open('public/data-el.json', 'w'), separators=(',', ':'), ensure_ascii=False)
print('team-seasons', len(teams), 'players', sum(len(t[4]) for t in teams), round(os.path.getsize('public/data-el.json') / 1e6, 2), 'MB')
print(r.ovr.describe().round(1).to_dict())
top = r.sort_values('ovr', ascending=False).head(24)[['Season', 'Tm', 'Player', 'Pos', 'ovr', 'G']]
print(top.to_string())
print(r[r.MP >= 15 * r.tg].Pos.value_counts().to_dict())
print(r.groupby(['Season', 'Tm']).size().describe().round(1).to_dict())
