"""Awards tables (data/honors/*) -> {(season_end_year, normalized name): honors}."""
import re, unicodedata, os
HD = os.path.join(os.path.dirname(__file__), '..', 'data', 'honors')
SUF = {'jr', 'sr', 'ii', 'iii', 'iv'}

ALIAS = {'edy tavares': 'walter tavares', 't j shorts': 'tj shorts', 'theo papaloukas': 'theodoros papaloukas',
         'sarunas jasikevicius': 'saras jasikevicius', 'ksystof lavrinovic': 'ksistof lavrinovic', 'derrick hamilton': 'dereck hamilton',
         'jemeil rich': 'jameil rich', 'ioannis giannoulis': 'yannis giannoulis', 'manu ginobili': 'emanuel ginobili',
         'ariel mcdonald': 'arriel mcdonald'}

def norm(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    s = re.sub(r"[^a-z ]", " ", s.replace("'", ""))
    t = [w for w in s.split() if w not in SUF]
    r = ' '.join(t)
    return ALIAS.get(r, r)

def _yr(s):
    return int(s[:4]) + 1 if '-' in s else int(s)

def load_nba():
    H = {}
    def add(y, n, tag):
        H.setdefault((y, norm(n)), set()).add(tag)
    for fn, pre in (('nba_allnba.txt', 'A'), ('nba_alldef.txt', 'D')):
        for ln in open(os.path.join(HD, fn), encoding='utf8'):
            if not ln.strip() or ln[0] == '#': continue
            s, t, names = ln.strip().split('|')
            for n in names.split(';'):
                add(_yr(s), n.strip(), pre + t)
    for ln in open(os.path.join(HD, 'nba_awards.txt'), encoding='utf8'):
        if not ln.strip() or ln[0] == '#': continue
        y, a, n = ln.strip().split('|')
        add(int(y), n, a)
    return H

def load_el():
    H = {}
    for ln in open(os.path.join(HD, 'el_awards.txt'), encoding='utf8'):
        if not ln.strip() or ln[0] == '#': continue
        y, t, names = ln.strip().split('|')
        for n in names.split(';'):
            H.setdefault((int(y) - 1, norm(n.strip())), set()).add('E' + t if t in ('1', '2') else t)  # EL data keyed by season START year
    return H
