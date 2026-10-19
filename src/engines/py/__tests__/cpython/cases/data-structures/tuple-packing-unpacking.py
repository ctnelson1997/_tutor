# Tuples: packing, unpacking, starred targets, nested tuples, single-element and empty tuples, swap
point = 3, 4
x, y = point
print(point, x, y)
single = (5,)
not_tuple = (5)
empty = ()
print(single, type(single).__name__, not_tuple, type(not_tuple).__name__, empty, len(empty))
also_single = 7,
print(also_single, len(also_single))
first, *middle, last = (1, 2, 3, 4, 5)
print(first, middle, last)
head, *rest = "abc"
print(head, rest)
*none_left, only = [9]
print(none_left, only)
nested = ((1, 2), (3, (4, 5)))
(a, b), (c, (d, e)) = nested
print(a, b, c, d, e)
a, b = b, a
print(a, b)
record = ("Ada", 36, ("London", "UK"))
name, age, (city, country) = record
print(f"{name} {age} {city} {country}")
t = (1, [2, 3])
t[1].append(4)
print(t, t.count(1), t.index([2, 3, 4]))
pairs = [(1, "one"), (2, "two")]
for num, word in pairs:
    print(num, word)
combined = single + point + ("z",)
print(combined, combined * 2, combined[::-1])
try:
    p, q = (1, 2, 3)
except ValueError as e:
    print("ValueError:", e)
