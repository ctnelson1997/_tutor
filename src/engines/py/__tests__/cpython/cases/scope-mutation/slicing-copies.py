# a[:], list(a) and a.copy() make new outer lists that still share inner lists; a full slice of a tuple or str is the same object
a = [[1, 2], [3, 4], 5]
b = a[:]
c = list(a)
d = a.copy()
b[2] = 50
print(a, b)
c[0].append(9)
print(a, b, c, d)
print(a is b, a[0] is b[0], a == d)
t = (1, 2, 3)
s = "hello"
print(t[:] is t, s[:] is s)
e = a[::-1]
e[1][0] = "changed"
print(a, e)
part = a[0:2]
part.append("only in part")
print(len(a), len(part))
