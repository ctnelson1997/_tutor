# json.dumps (indent, sort_keys, separators) and json.loads: True/None mapping, tuples become lists, int keys become strings
import json

student = {"name": "Ann", "age": 20, "grades": [90, 85.5], "active": True,
           "advisor": None, "pos": (3, 4), 7: "lucky"}
text = json.dumps(student)
print(text)
print(json.dumps({"b": 1, "a": [True, None], "c": {"z": 0, "y": 1.5}}, sort_keys=True, indent=2))
print(json.dumps([1, "two", 3.0], separators=(",", ":")))
back = json.loads(text)
print(back)
print(back == student, back["pos"], back["7"], type(back["grades"][1]).__name__)
data = json.loads('{"items": [{"id": 1, "tags": ["a"]}, {"id": 2, "tags": []}], "ok": false}')
print([item["id"] for item in data["items"] if item["tags"]], data["ok"])
print(json.dumps("café \"quoted\""), json.dumps("café", ensure_ascii=False))
try:
    json.loads("{'single': 'quotes'}")
except json.JSONDecodeError as e:
    print("JSONDecodeError:", e)
try:
    json.dumps({1, 2})
except TypeError as e:
    print("TypeError:", e)
