# two names bound to one list: mutation through either name shows through both; b = b + [...] rebinds, a += [...] mutates
a = [1, 2, 3]
b = a
b.append(4)
print(a, b, a is b)
a[0] = 100
print(b)
b = b + [5]
print(a, b, a is b)
a += [6]
print(a, b)
c = a
c.clear()
print(a, c, len(a))
names = {"x": a}
names["x"].append("via dict")
print(a, c, names)
c = None
print(a, c)
