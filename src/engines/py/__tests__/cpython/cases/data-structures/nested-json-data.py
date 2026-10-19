# A dict of lists of dicts (JSON-like data): traversal, aggregation, nested updates, appending new records
school = {
    "classes": [
        {"name": "Math", "students": [{"id": 1, "score": 90}, {"id": 2, "score": 72}]},
        {"name": "Art", "students": [{"id": 3, "score": 85}]},
    ],
    "year": 2024,
    "tags": ["public", "k12"],
    "principal": None,
}
for cls in school["classes"]:
    scores = [s["score"] for s in cls["students"]]
    avg = sum(scores) / len(scores)
    print(cls["name"], scores, avg)
school["classes"][1]["students"].append({"id": 4, "score": 95})
school["classes"].append({"name": "Music", "students": []})
best = max((s for c in school["classes"] for s in c["students"]), key=lambda s: s["score"])
print(best)
summary = {c["name"]: len(c["students"]) for c in school["classes"]}
print(summary)
math = school["classes"][0]
math["students"][1]["score"] += 5
print(school["classes"][0]["students"][1])
lookup = {}
for c in school["classes"]:
    for s in c["students"]:
        lookup[s["id"]] = c["name"]
print(lookup, school["tags"][-1])
empty_classes = [c["name"] for c in school["classes"] if not c["students"]]
print(empty_classes, len(school), school["year"], school["principal"])
