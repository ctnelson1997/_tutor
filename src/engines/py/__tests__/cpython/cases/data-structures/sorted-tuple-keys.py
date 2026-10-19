# sorted with tuple keys: (-score, name), (len, word), None-safe keys, min/max with tuple keys, mixed-type tie error
players = {"zed": 90, "amy": 95, "bob": 90, "cat": 82, "dan": 95}
ranking = sorted(players, key=lambda n: (-players[n], n))
print(ranking)
by_len_then_alpha = sorted(["kiwi", "fig", "apple", "date", "pea"], key=lambda w: (len(w), w))
print(by_len_then_alpha)
records = [{"name": "Ann", "dept": "IT", "age": 30},
           {"name": "Bo", "dept": "HR", "age": 25},
           {"name": "Cy", "dept": "IT", "age": 25},
           {"name": "Di", "dept": "HR", "age": 40}]
ordered = sorted(records, key=lambda r: (r["dept"], -r["age"]))
print([r["name"] for r in ordered])
values = [3, None, 1, None, 2]
safe = sorted(values, key=lambda v: (v is None, v or 0))
print(safe)
oldest = max(records, key=lambda r: (r["age"], r["name"]))
youngest = min(records, key=lambda r: (r["age"], r["name"]))
print(oldest["name"], youngest["name"])
points = [(2, 3), (1, 5), (2, 1), (1, -1)]
print(sorted(points), sorted(points, key=lambda p: (p[1], p[0])), sorted(points, reverse=True))
keys = [(len(w), w[-1]) for w in ["ab", "c", "de"]]
print(keys, sorted(keys))
try:
    sorted([(1, "a"), (1, 2)])
except TypeError as e:
    print("TypeError:", e)
