import pandas as pd, numpy as np, unicodedata, re
OLD="/mnt/user-data/uploads/dc9591e5-NBA_Player_Stats1950_-_2022.csv"
def norm(s):
    s=unicodedata.normalize('NFKD',str(s)).encode('ascii','ignore').decode().lower()
    s=re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?","",s); return re.sub(r"[^a-z]","",s)
ABB={'76ers':'PHI','Bucks':'MIL','Bulls':'CHI','Cavaliers':'CLE','Celtics':'BOS','Clippers':'LAC','Grizzlies':'MEM','Hawks':'ATL','Heat':'MIA','Hornets':'CHO','Jazz':'UTA','Kings':'SAC','Knicks':'NYK','Lakers':'LAL','Magic':'ORL','Mavericks':'DAL','Nets':'BRK','Nuggets':'DEN','Pacers':'IND','Pelicans':'NOP','Pistons':'DET','Raptors':'TOR','Rockets':'HOU','Spurs':'SAS','Suns':'PHO','Thunder':'OKC','Timberwolves':'MIN','Trail Blazers':'POR','Warriors':'GSW','Wizards':'WAS'}
def build():
    d=pd.read_pickle('/tmp/ps.pkl') if False else pd.read_csv('/mnt/user-data/uploads/PlayerStatistics.csv',dtype=str,low_memory=False)
    d['dt']=pd.to_datetime(d.gameDateTimeEst,errors='coerce')
    d['Season']=d.dt.dt.year+(d.dt.dt.month>=9).astype(int)
    d=d[d.gameType.isin(['Regular Season','NBA Emirates Cup','Emirates NBA Cup','NBA Cup'])&d.Season.between(2023,2026)].copy()
    num=['numMinutes','points','assists','blocks','steals','fieldGoalsAttempted','fieldGoalsMade','threePointersAttempted','threePointersMade','freeThrowsAttempted','freeThrowsMade','reboundsDefensive','reboundsOffensive','reboundsTotal','foulsPersonal','turnovers']
    for c in num: d[c]=pd.to_numeric(d[c],errors='coerce').fillna(0)
    d=d[d.numMinutes>0]
    d['Tm']=d.playerteamName.map(ABB); assert d.Tm.notna().all()
    d['Player']=d.firstName+' '+d.lastName
    d['start']=(d.startingPosition.fillna('')!='').astype(int)
    g=d.groupby(['Season','personId','Player','Tm'],as_index=False).agg(G=('gameId','nunique'),GS=('start','sum'),MP=('numMinutes','sum'),FG=('fieldGoalsMade','sum'),FGA=('fieldGoalsAttempted','sum'),**{'3P':('threePointersMade','sum'),'3PA':('threePointersAttempted','sum')},FT=('freeThrowsMade','sum'),FTA=('freeThrowsAttempted','sum'),ORB=('reboundsOffensive','sum'),DRB=('reboundsDefensive','sum'),TRB=('reboundsTotal','sum'),AST=('assists','sum'),STL=('steals','sum'),BLK=('blocks','sum'),TOV=('turnovers','sum'),PF=('foulsPersonal','sum'),PTS=('points','sum'))
    g['2P']=g.FG-g['3P']; g['2PA']=g.FGA-g['3PA']
    for a,b,c in [('FG%','FG','FGA'),('3P%','3P','3PA'),('2P%','2P','2PA'),('FT%','FT','FTA')]: g[a]=(g[b]/g[c].replace(0,np.nan))
    g['eFG%']=(g.FG+0.5*g['3P'])/g.FGA.replace(0,np.nan)
    old=pd.read_csv(OLD); old=old[old.Tm!='TOT'].copy(); old['k']=old.Player.map(norm)
    last=old.sort_values('Season').groupby('k').tail(1).set_index('k')
    g['k']=g.Player.map(norm)
    # classifier for unknown pos
    rec=old[(old.Season>=2012)&(old.MP>=500)].copy()
    rec['p36']=rec.PTS/rec.MP*36
    def feats(x): 
        m=x.MP.clip(lower=1)
        return np.c_[x.AST/m*36,x.TRB/m*36,x.BLK/m*36,x['3PA']/m*36,x.STL/m*36]
    P=rec.Pos.str.split('-').str[0]; P=P.where(P.isin(['PG','SG','SF','PF','C']),None); rec=rec[P.notna()]; P=P[P.notna()]
    F=feats(rec); mu,sd=F.mean(0),F.std(0)+1e-9
    cent={p:((F[(P==p).values]-mu)/sd).mean(0) for p in ['PG','SG','SF','PF','C']}
    def infer(r):
        f=(feats(pd.DataFrame([r]))[0]-mu)/sd
        return min(cent,key=lambda p:((f-cent[p])**2).sum())
    pos,age=[],[]
    nunk=0
    for _,r in g.iterrows():
        if r.k in last.index:
            pos.append(last.loc[r.k,'Pos']); age.append(float(last.loc[r.k,'Age'])+(r.Season-last.loc[r.k,'Season']))
        else:
            nunk+=1; pos.append(infer(r)); age.append(np.nan)
    g['Pos']=pos; g['Age']=age
    g['Player']=[last.loc[k,'Player'] if k in last.index else p for k,p in zip(g.k,g.Player)]
    print('rows',len(g),'unknown-pos rows',nunk)
    return g.drop(columns=['personId','k'])
if __name__=='__main__':
    g=build(); g.to_csv('/tmp/new_seasons.csv',index=False); print(g.groupby('Season').size()); print(g.sort_values('MP',ascending=False).head(8)[['Season','Player','Tm','Pos','G','MP','PTS']])
