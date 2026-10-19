# str() vs repr() for strings with quotes/escapes, floats, None, and containers (which always repr elements)
s1 = "plain"
s2 = "it's"
s3 = 'say "hi"'
s4 = "both ' and \""
s5 = "tab\tnewline\nback\\slash"
for s in [s1, s2, s3, s4, s5]:
    print(str(s), "|", repr(s))
x = 0.1
y = 1 / 3
z = 2.0
print(str(x), repr(x), str(y), repr(z))
print(str(None), repr(None), str(True), repr(""))
words = [s1, s2, s3]
print(words)
print(str(words) == repr(words))
print((s4,), {s2: s3})
print(repr(repr(s1)))
print(len(repr(s5)), len(s5))
mixed = [1, 1.0, "1", None, [s5]]
print(mixed)
print(str(mixed))
print(", ".join(repr(v) for v in mixed))
