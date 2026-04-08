import json, sys
d = json.load(open(sys.argv[1]))
print(f"Total candidates: {len(d['bestTrials'])}")
for t in d["bestTrials"]:
    score = t["score"]
    s = t["evaluation"]["summary"]["factions"]
    winners = {fid: v["wins"] for fid, v in s.items() if v["wins"] > 0}
    o = t["evaluation"]["objective"]
    pen = sum(v for k, v in o.items() if "enalty" in k)
    print(f"  Trial {t['trial']:2d}: score={score:.4f}  winners={winners}  penalties={pen:.1f}")
best = min(d["bestTrials"], key=lambda x: x["score"])
print(f"\n>>> BEST: Trial {best['trial']}, Score: {best['score']:.4f}")
s = best["evaluation"]["summary"]["factions"]
for fid, v in s.items():
    print(f"  {fid}: {v['wins']}W  {v['avgLivingUnits']:.1f} units  {v['avgSignatureUnits']:.1f} sig")
o = best["evaluation"]["objective"]
for k, v in o.items():
    print(f"  {k}: {v}")
