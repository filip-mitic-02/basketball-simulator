import pandas as pd, numpy as np, json, sys
SRC="/mnt/user-data/uploads/dc9591e5-NBA_Player_Stats1950_-_2022.csv"
d=pd.read_csv(SRC,encoding='utf-8')
d=d.drop(columns=[c for c in d.columns if c.startswith('Unnamed')])
import os
if os.path.exists('/tmp/new_seasons.csv'):
    nw=pd.read_csv('/tmp/new_seasons.csv'); d=pd.concat([d,nw],ignore_index=True,sort=False); d['Season']=d.Season.astype(int); print('merged new seasons',len(nw))
print([n for n in d.Player.unique() if 'Kuko' in n or 'Jokic' in n or 'Doncic' in n or 'Don' in n[:4]][:6])
num=['Age','G','MP','FG','FGA','3P','3PA','2P','2PA','FT','FTA','ORB','DRB','TRB','AST','STL','BLK','TOV','PF','PTS']
for c in num: d[c]=pd.to_numeric(d[c],errors='coerce')
d=d[d.Tm!='TOT'].copy()
d=d[d.G>0]
# --- estimate missing minutes (early 1950s) via regression on shot volume per game
has=d.MP.notna()
d['spg']=(d.FGA+0.44*d.FTA.fillna(0)+0.4*d.AST.fillna(0))/d.G
tr=d[has&(d.Season.between(1952,1956))&(d.G>=20)]
A=np.polyfit(tr.spg,tr.MP/tr.G,1)
miss=~has
d.loc[miss,'MP']=(np.clip(np.polyval(A,d.spg[miss]),6,42)*d.G[miss])
d['limited']=(d.Season<1974)
# --- impute missing columns
for c in ['3P','3PA']: d[c]=d[c].fillna(0)
d['FTA']=d.FTA.fillna(0); d['FT']=d.FT.fillna(0)
d['AST']=d.AST.fillna(0)
d['PF']=d.PF.fillna(d.G*2.2)
# rebounds: pos pooled mean per minute from 1952-1955 seasons for rows w/ TRB missing
d['posg']=d.Pos.str[-1].map({'G':'G','F':'F','C':'C'}).fillna('F')
d.loc[d.Pos.isin(['PG','SG','G']),'posg']='G'
d.loc[d.Pos.isin(['SF','PF','F','SF-SG','PF-SF','SG-SF','SF-PF','G-F','F-G']),'posg']='F'
d.loc[d.Pos.str.startswith('C')|d.Pos.str.endswith('C'),'posg']='C'
trb_has=d.TRB.notna()
rb=(d[trb_has&(d.Season<1962)].groupby('posg').apply(lambda x:x.TRB.sum()/x.MP.sum())).to_dict()
mis=~trb_has
d.loc[mis,'TRB']=d.loc[mis].apply(lambda r:rb.get(r.posg,0.12)*r.MP,axis=1)
# ORB/DRB split when missing (pre-1974): ORB ~ 0.30*TRB for C,F; 0.25 for G
oshare=d.posg.map({'G':0.26,'F':0.30,'C':0.32})
d['ORB']=d.ORB.fillna(d.TRB*oshare); d['DRB']=d.DRB.fillna(d.TRB-d.ORB)
d['hasdef']=d.STL.notna()
d['STLi']=d.STL; d['BLKi']=d.BLK
d['TOVm']=d.TOV.isna()
d['STL']=d.STL.fillna(0); d['BLK']=d.BLK.fillna(0)
d['TOV']=d.TOV.fillna(0)
# --- league per-season baselines (minutes-weighted)
def lg(g):
    mp=g.MP.sum(); fga=g.FGA.sum(); fta=g.FTA.sum()
    k=g[~g.TOVm]
    return pd.Series(dict(
      mp=mp,
      p2=g['2P'].sum()/max(1,g['2PA'].sum()), p3=g['3P'].sum()/max(1,g['3PA'].sum()),
      r3=g['3PA'].sum()/fga, ft=g.FT.sum()/max(1,fta), ftr=fta/fga,
      tovr=(k.TOV.sum()/(k.FGA.sum()+.44*k.FTA.sum()+k.TOV.sum())) if len(k)>200 else 0.14,
      u36=(fga+.44*fta+g.TOV.sum())/mp*36,
      ast36=g.AST.sum()/mp*36, orb36=g.ORB.sum()/mp*36, drb36=g.DRB.sum()/mp*36,
      stl36=(g.STL.sum()/max(1,g[g.hasdef].MP.sum()))*36, blk36=(g.BLK.sum()/max(1,g[g.hasdef].MP.sum()))*36,
      pf36=g.PF.sum()/mp*36))
L=d.groupby('Season').apply(lg)
d=d.join(L,on='Season',rsuffix='_lg')
d['tovr_i']=np.where(d.TOVm,np.nan,d.TOV/(d.FGA+.44*d.FTA+d.TOV))
mp=d.MP.clip(lower=1)
# regressed rates
d['P2']=(d['2P']+200*d.p2)/(d['2PA']+200)
d['P3']=(d['3P']+150*d.p3)/(d['3PA']+150)
d['FTP']=(d.FT+100*d.ft)/(d.FTA+100)
d['R3']=d['3PA']/d.FGA.clip(lower=1)
d['FTR']=((d.FTA+15*d.ftr)/(d.FGA+15)) / d.ftr   # relative
d['USG']=((d.FGA+.44*d.FTA+d.TOV)/mp*36)/d.u36
# for rows w/o TOV recorded, usage computed w/o TOV -> bias; adjust using league tovr
d.loc[d.TOVm,'USG']=((d.FGA+.44*d.FTA)/(1-d.tovr)/mp*36)/d.u36
poss=d.FGA+.44*d.FTA+d.TOV
d['TOVR']=np.where(d.TOVm,1.0,((d.TOV+40*d.tovr)/(poss+40*1.0*1))/d.tovr) # relative to league (approx)
d['TOVR']=d.TOVR.clip(0.5,2.0)
sh=mp/(mp+250)
d['AST_']=(d.AST/mp*36/d.ast36)
d['ORB_']=(d.ORB/mp*36/d.orb36)
d['DRB_']=(d.DRB/mp*36/d.drb36)
d['STL_']=np.where(d.hasdef,(d.STL/mp*36/d.stl36),np.nan)
d['BLK_']=np.where(d.hasdef,(d.BLK/mp*36/d.blk36),np.nan)
posstl={'G':1.2,'F':0.95,'C':0.6}; posblk={'G':0.35,'F':0.9,'C':2.2}
d['STL_']=d.STL_.fillna(d.posg.map(posstl)); d['BLK_']=d.BLK_.fillna(d.posg.map(posblk))
# shrink toward 1 by minutes
for c in ['AST_','ORB_','DRB_','STL_','BLK_']:
    d[c]=(d[c]*mp+1*0+ d[c].mean()*0)/mp  # placeholder
for c,k in [('AST_',300),('ORB_',250),('DRB_',250),('STL_',500),('BLK_',500)]:
    base={'AST_':1,'ORB_':1,'DRB_':1,'STL_':1,'BLK_':1}[c]
    # regress to position mean
    pm=d.groupby('posg')[c].transform('mean')
    d[c]=(d[c]*mp+pm*k)/(mp+k)
d['PF_']=((d.PF/mp*36)/d.pf36)
d['PF_']=((d.PF_*mp+1*300)/(mp+300)).clip(0.5,1.8)
# --- OVR: era-normalized game score / 36
gs=(d.PTS+.4*d.FG-.7*d.FGA-.4*(d.FTA-d.FT)+.7*d.ORB+.3*d.DRB+d.STL+.7*d.AST+.7*d.BLK-.4*d.PF-d.TOV)/mp*36
d['gs']=gs
ref=d[d.MP>=500]
mu=ref.groupby('Season').apply(lambda x:np.average(x.gs,weights=x.MP)).rename('gmu')
sd=ref.groupby('Season').apply(lambda x:np.sqrt(np.average((x.gs-np.average(x.gs,weights=x.MP))**2,weights=x.MP))).rename('gsd')
d=d.join(mu,on='Season').join(sd,on='Season')
z=(d.gs-d.gmu)/d.gsd
w=mp/(mp+350)
zs=z*w+(-0.9)*(1-w)
# minutes-load bonus (stars carry high minutes) 
mpg=mp/d.G
zs=zs+0.18*((mpg-24)/10).clip(-1.5,1.5)
zs=np.where(d.limited,zs*0.85,zs)
d['ovr']=(58+10.2*zs).round().clip(28,99)
# --- roster selection per team-season
def keep(g):
    g=g.sort_values('MP',ascending=False)
    g=g[(g.MP>=200)|(g.index.isin(g.index[:9]))]
    return g.head(13)
d['rk']=d.groupby(['Season','Tm']).MP.rank(ascending=False,method='first')
r=d[d.rk<=13]
r=r[(r.MP>=150)|(r.rk<=8)]
cnt=r.groupby(['Season','Tm']).size()
ok=cnt[cnt>=8].index
r=r.set_index(['Season','Tm']).loc[ok].reset_index()
print('team-seasons',len(ok),'players',len(r))
NAMES={'ATL':'Atlanta Hawks','BOS':'Boston Celtics','BRK':'Brooklyn Nets','NJN':'New Jersey Nets','NYN':'New York Nets','CHA':'Charlotte Bobcats','CHH':'Charlotte Hornets','CHO':'Charlotte Hornets','CHI':'Chicago Bulls','CLE':'Cleveland Cavaliers','DAL':'Dallas Mavericks','DEN':'Denver Nuggets','DET':'Detroit Pistons','GSW':'Golden State Warriors','SFW':'San Francisco Warriors','PHW':'Philadelphia Warriors','HOU':'Houston Rockets','IND':'Indiana Pacers','LAC':'Los Angeles Clippers','SDC':'San Diego Clippers','BUF':'Buffalo Braves','LAL':'Los Angeles Lakers','MNL':'Minneapolis Lakers','MEM':'Memphis Grizzlies','VAN':'Vancouver Grizzlies','MIA':'Miami Heat','MIL':'Milwaukee Bucks','MIN':'Minnesota Timberwolves','NOH':'New Orleans Hornets','NOK':'Oklahoma City Hornets','NOP':'New Orleans Pelicans','NYK':'New York Knicks','OKC':'Oklahoma City Thunder','SEA':'Seattle SuperSonics','ORL':'Orlando Magic','PHI':'Philadelphia 76ers','SYR':'Syracuse Nationals','PHO':'Phoenix Suns','POR':'Portland Trail Blazers','SAC':'Sacramento Kings','KCK':'Kansas City Kings','KCO':'Kansas City-Omaha Kings','CIN':'Cincinnati Royals','ROC':'Rochester Royals','SAS':'San Antonio Spurs','TOR':'Toronto Raptors','UTA':'Utah Jazz','NOJ':'New Orleans Jazz','WAS':'Washington Wizards','WSB':'Washington Bullets','CAP':'Capital Bullets','BAL':'Baltimore Bullets','BLB':'Baltimore Bullets','CHZ':'Chicago Zephyrs','CHP':'Chicago Packers','CHS':'Chicago Stags','FTW':'Fort Wayne Pistons','INO':'Indianapolis Olympians','MLH':'Milwaukee Hawks','STL':'St. Louis Hawks','TRI':'Tri-Cities Blackhawks','SDR':'San Diego Rockets','WSC':'Washington Capitols','WAT':'Waterloo Hawks','AND':'Anderson Packers','DNN':'Denver Nuggets','SHE':'Sheboygan Red Skins','STB':'St. Louis Bombers'}
def NAME(tm,s):
    if tm=='CHA' and s>=2015: return 'Charlotte Hornets'
    if tm=='STL' and s<1960: return 'St. Louis Hawks'
    return NAMES.get(tm,tm)
def pos(p):
    m={'PG':'PG','SG':'SG','SF':'SF','PF':'PF','C':'C','G':'G','F':'F'}
    if p in m: return p
    return p.split('-')[0]
def elig(p):
    toks=set(p.split('-'))
    if {'G','F'}<=toks: out={'SG','SF'}
    elif {'F','C'}<=toks: out={'PF','C'}
    else:
        out=set()
        for t in toks:
            if t=='G': out|={'PG','SG'}
            elif t=='F': out|={'SF','PF'}
            else: out.add(t)
    order=['PG','SG','SF','PF','C']
    return ','.join([x for x in order if x in out])
def R(x,n=3): return round(float(x),n)
teams=[]
for (s,tm),g in r.groupby(['Season','Tm']):
    g=g.sort_values('MP',ascending=False)
    pl=[]
    for _,x in g.iterrows():
        G=x.G
        lim=bool(x.limited)
        pl.append([x.Player,pos(x.Pos),int(x.Age) if x.Age==x.Age else 0,int(G),
           R(x.MP/G,1),R(x.PTS/G,1),R(x.TRB/G,1),R(x.AST/G,1),
           None if not x.hasdef else R(x.STL/G,1), None if not x.hasdef else R(x.BLK/G,1),
           R(x['FG%'],3) if x['FG%']==x['FG%'] else 0, R(x['3P%'],3) if (x['3P%']==x['3P%'] and x['3PA']>=10) else None, R(x['FT%'],3) if x['FT%']==x['FT%'] else 0,
           int(x.ovr),
           R(x.USG,2),R(x.P2-x.p2,3),R(x.P3-x.p3,3),R(x.R3,2),R(x.FTP,3),R(x.FTR,2),R(x.TOVR,2),R(x.AST_,2),R(x.ORB_,2),R(x.DRB_,2),R(x.STL_,2),R(x.BLK_,2),R(x.PF_,2),1 if lim else 0,elig(x.Pos)])
    teams.append([f"{s}-{tm}",int(s),tm,NAME(tm,s),pl])
# league constants per season (for modern baseline mapping everything is relative, so just export a few)
fields=["name","pos","age","g","mpg","ppg","rpg","apg","spg","bpg","fg","tp","ft","ovr","usg","p2","p3","r3","ftp","ftr","tov","ast","orb","drb","stl","blk","pf","lim","elig"]
json.dump({"fields":fields,"teams":teams},open("site/data.json","w"),separators=(',',':'),ensure_ascii=False)
import os; print(os.path.getsize("site/data.json")/1e6,'MB')
# --- diagnostics
t=r[r.Season==1996][r.Tm=='CHI'][['Player','MP','ovr','USG','P2','P3','R3','AST_','STL_','BLK_']]
print(t.round(2).to_string())
top=r.sort_values('ovr',ascending=False).head(25)[['Season','Tm','Player','ovr']]
print(top.to_string())
print(r.ovr.describe())
