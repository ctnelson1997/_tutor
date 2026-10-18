# Dict and set comprehensions: build, filter, invert a dict; sets of ints printed sorted
words = ["apple", "bob", "civic", "dog", "eve", "apple"]
lengths = {w: len(w) for w in words}
palindromes = {w for w in words if w == w[::-1]}
codes = {"a": 1, "b": 2, "c": 3}
inverted = {v: k for k, v in codes.items()}
squares = {n: n ** 2 for n in range(6) if n % 2}
mods = {n % 4 for n in range(20)}
nested = {k: [i for i in range(v)] for k, v in codes.items()}
print(lengths)
print(sorted(palindromes))
print(inverted)
print(squares)
print(mods, sorted(mods))
print(nested)
first_letters = {w[0]: w for w in words}
print(first_letters)
