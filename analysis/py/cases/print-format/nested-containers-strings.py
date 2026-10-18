# nested lists/dicts/tuples/sets holding strings with quotes and escapes print with nested reprs
grid = [["X", "O", " "], [" ", "X", "O"], ["O", " ", "X"]]
print(grid)
for row in grid:
    print("|".join(row))
book = {"title": "Don't Panic", "tags": ["sci-fi", "comedy"], "meta": {"pages": 224, "isbn": None}}
print(book)
print(book["meta"])
pairs = [("a", 1), ("b\nc", 2), ('q"q', 3)]
print(pairs)
nested = [1, [2, [3, [4, ["deep"]]]]]
print(nested)
print(nested[1][1][1][1][0])
mixed = {"tuple": (1,), "empty": (), "list": [], "set": {3, 1, 2}, "frozen": frozenset({5})}
print(mixed)
emptyset = set()
print(emptyset, [emptyset], {"s": set()})
records = [{"name": "Al", "langs": ["py", "js"]}, {"name": "Bea", "langs": []}]
for r in records:
    print(r["name"], r["langs"], len(r["langs"]))
print(records)
