# zip and enumerate: results kept in lists, unequal lengths, zip(*) to unzip, strict=True, iterator objects used up
names = ["ann", "bo", "cy"]
scores = [88, 92, 75, 60]
pairs = list(zip(names, scores))
print(pairs)
indexed = list(enumerate(names, start=1))
print(indexed)
lazy = zip(names, scores)
first = next(lazy)
rest = list(lazy)
again = list(lazy)
print(first, rest, again)
who, marks = zip(*pairs)
print(who, marks)
triples = list(zip(names, scores, "xyz"))
print(triples)
table = dict(enumerate("abc"))
print(table)
for i, (name, score) in enumerate(zip(names, scores)):
    print(i, name, score)
try:
    list(zip(names, scores, strict=True))
except ValueError as e:
    print("ValueError:", e)
counter = enumerate(["p", "q"])
print(next(counter), list(counter))
columns = list(zip(*[[1, 2, 3], [4, 5, 6]]))
print(columns, list(zip()))
