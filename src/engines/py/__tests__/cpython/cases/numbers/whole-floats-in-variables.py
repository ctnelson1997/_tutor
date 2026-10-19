# floats with whole values (5.0, 10/2, float(3), 2.0**10) must stay floats, also as dict keys/values and next to equal ints
x = 5.0
y = 10 / 2
z = float(3)
w = 2.0 ** 10
t = 1e3
u = 3 * 1.0
v = sum([0.5, 0.5])
big = 1e15
print(x, y, z, w, t, u, v, big)
print(x == 5, x is not None, int(x), type(x).__name__)
mixed = [1, 1.0, 2, 2.0]
print(mixed)
d = {1: "int key"}
d[1.0] = "float overwrote"
print(d)
e = {1.0: "float first"}
e[1] = "int second"
print(e)
point = (0.0, -2.0)
print(point, max(3, 3.0), max(3.0, 3), min(2.0, 2))
print(round(5.0), round(5.0, 1), abs(-4.0), x // 2, x % 2)
