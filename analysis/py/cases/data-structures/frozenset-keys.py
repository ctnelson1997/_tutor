# frozenset: immutable and hashable, used as dict keys and set members, operations keep the left operand's type
a = frozenset([1, 2, 3])
b = frozenset({3, 4})
print(a, b, a | b, a & b)
print(type(a - b).__name__, a - b)
mixed = {5, 6} | a
print(mixed, type(mixed).__name__, type(a | {5}).__name__)
try:
    a.add(4)
except AttributeError as e:
    print("AttributeError:", e)
edges = {frozenset({1, 2}): 5, frozenset({2, 3}): 7}
print(edges[frozenset({2, 1})], frozenset({3, 2}) in edges)
edges[frozenset({1, 3})] = 4
total = sum(edges.values())
print(edges, total, len(edges))
teams = {frozenset({1, 2}), frozenset({2, 1}), frozenset({3})}
print(len(teams), sorted(sorted(t) for t in teams))
empty = frozenset()
print(empty, empty == set(), frozenset({1}) == {1})
hand = frozenset("aab")
print(sorted(hand), len(hand))
groups = [frozenset(), frozenset({0}), frozenset({0, 1})]
print(groups, groups[1] < groups[2])
