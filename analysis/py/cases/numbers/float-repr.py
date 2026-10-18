# float reprs held in variables: shortest round-trip digits, the e+16/e-05 switch points, huge and tiny values
a = 0.1 + 0.2
b = 1e16
c = 1e-7
d = 1e22
e = 123456789012345678.0
f = 0.1 * 3
g = 2.5e-5
h = 1 / 3
i = 1e-4
j = 1e-5
k = 1e15 + 0.3
m = 5e-324
n = 1.7976931348623157e308
p = 9999999999999998.0
q = 1e21
r = float("1.10")
print(a, b, c, d)
print(e, f, g, h)
print(i, j, k)
print(m, n, p, q, r)
print([a, b, c, i, j])
print(str(b), repr(c), f"{d}", "%s" % j)
print(0.1 + 0.2 == 0.3, a - 0.3)
print(1e16 + 1, 2.0 ** 53 + 1)
