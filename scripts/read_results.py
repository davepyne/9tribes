import json, sys
d = json.load(open(sys.argv[1]))
t = d["bestTrials"][-1]
print(f"Trial: {t['trial']}, Score: {t['score']:.4f}")
print()
s = t["evaluation"]["summary"]["factions"]
for fid, v in s.items():
    print(f"  {fid}: {v['wins']}W  {v['avgLivingUnits']:.1f} units  {v['avgSignatureUnits']:.1f} sig")
print()
o = t["evaluation"]["objective"]
for k, v in o.items():
    print(f"  {k}: {v}")
