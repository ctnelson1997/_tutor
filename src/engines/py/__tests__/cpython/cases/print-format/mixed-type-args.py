# print with many args of mixed types, print(None)/print(True), and print's own return value (None)
n = 42
f = 2.5
s = "text"
lst = [1, "a", None]
tup = (1,)
d = {"k": [1, 2], 3: "v"}
print(n, f, s, lst, tup, d)
print(None)
print(True, False)
print(None, True, 0, "", [], {}, ())
print(1 == 1.0, n is None, not None)
result = print("printing returns:")
print(result)
print(type(result).__name__, type(n).__name__, type(f).__name__)
print(n + f, s * 2, lst + [tup], len(d))
print("" == s, s.upper(), str(None) + "!")
empty = ""
print(empty)
print(empty, empty, sep="|")
