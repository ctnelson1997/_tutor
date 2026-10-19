# Nested dicts: reading and writing inner dicts, one inner dict under two keys, copy() is shallow
school = {
    "math": {"teacher": "Ng", "students": 24},
    "art": {"teacher": "Oz", "students": 12},
}
print(school["math"]["teacher"])
school["art"]["students"] += 3
school["music"] = {"teacher": "Py"}
school["music"]["students"] = 9
print(school)
room = school["math"]
room["room"] = "B2"
print(school["math"])
shared = {"floor": 1}
building = {"east": shared, "west": shared}
building["east"]["floor"] = 2
print(building, building["east"] is building["west"])
backup = school.copy()
backup["math"]["students"] = 30
backup["gym"] = {}
print(school["math"]["students"], "gym" in school, len(backup))
total = 0
for subject, info in school.items():
    total += info["students"]
print(total)
deep = {"a": {"b": {"c": {"d": 1}}}}
deep["a"]["b"]["c"]["e"] = 2
print(deep)
