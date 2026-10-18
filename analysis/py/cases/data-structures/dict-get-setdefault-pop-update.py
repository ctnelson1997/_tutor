# dict.get/setdefault/pop/update/|: defaults, setdefault returning the stored list, pop with and without default
inventory = {"pens": 3, "pads": 0}
print(inventory.get("pens"), inventory.get("ink"), inventory.get("ink", 0))
print(inventory.get("pads", 99))
groups = {}
for word in ["ant", "bee", "ape", "bat", "cow"]:
    bucket = groups.setdefault(word[0], [])
    bucket.append(word)
print(groups)
existing = groups.setdefault("a", ["never used"])
print(existing is groups["a"], existing)
removed = inventory.pop("pads")
missing = inventory.pop("ink", "none")
print(removed, missing, inventory)
inventory.update(pens=5, ink=2)
inventory.update([("tape", 1), ("pens", 6)])
print(inventory)
merged = inventory | {"ink": 10, "glue": 4}
inventory |= {"clips": 7}
print(merged)
print(inventory)
try:
    inventory.pop("stapler")
except KeyError as e:
    print("KeyError:", e)
none_default = groups.setdefault("z")
print(none_default, groups["z"], len(groups))
