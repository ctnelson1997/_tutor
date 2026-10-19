# Dict views held in variables stay live: keys/values/items reflect later changes, keys support set ops
ages = {"ann": 20, "ben": 31}
names = ages.keys()
years = ages.values()
pairs = ages.items()
print(names, years, pairs)
ages["cal"] = 25
print(len(names), list(years), ("cal", 25) in pairs)
del ages["ann"]
print(list(names), list(pairs))
other = {"ben": 1, "dan": 2}
common = names & other.keys()
either = names | {"eve"}
print(sorted(common), sorted(either))
snapshot = list(names)
ages["fay"] = 40
print(snapshot, list(names))
total = sum(years)
print(total, max(pairs, key=lambda kv: kv[1]))
scores = {1: 10, 2: 20, 3: 30}
ks = scores.keys()
print(ks - {2}, ks ^ {3, 4}, 2 in ks)
scores.clear()
print(ks, len(ks))
