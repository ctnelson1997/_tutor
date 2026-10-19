# a list or dict containing itself prints with [...] / {...}; indirect cycles through two lists
a = [1, 2]
a.append(a)
print(a)
print(a[2] is a, len(a), a[2][2][2][0])
d = {"name": "loop"}
d["self"] = d
print(d)
b = [a]
print(b)
nested = [[]]
nested[0].append(nested)
print(nested)
print(repr(a) == "[1, 2, [...]]")
pair = [None, None]
first = [pair]
pair[0] = first
print(pair, first)
print(str(d), len(str(nested)))
