# Counter and defaultdict edge cases: zero/negative counts, subtract vs -, total(), missing keys vs `in` and get()
from collections import Counter, defaultdict

votes = Counter(["red", "blue", "red", "green", "red", "blue"])
print(votes, votes.most_common(1))
votes.subtract({"red": 1, "green": 2, "pink": 1})
print(votes)
print(+votes, votes.total())
print(votes["purple"], "purple" in votes)
a = Counter(x=3, y=1)
b = Counter(x=1, y=4, z=2)
print(a + b, a - b, a & b, a | b)
print(sorted(a.elements()), list((a + b).elements()))
del votes["pink"]
print(votes)

graph = defaultdict(list)
for src, dst in [(1, 2), (1, 3), (2, 3)]:
    graph[src].append(dst)
print(graph)
print(3 in graph, graph.get(3), len(graph))
neighbors = graph[3]
print(neighbors, len(graph), graph)
counts = defaultdict(lambda: defaultdict(int))
for word in ["tea", "toe", "ant", "tea"]:
    counts[word[0]][word] += 1
print({k: dict(v) for k, v in counts.items()})
plain = defaultdict(None, {"a": 1})
try:
    plain["b"]
except KeyError as e:
    print("KeyError:", e)
