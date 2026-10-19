# -0.0 keeps its sign in repr, str, f-strings and containers, though it equals 0.0
import math
z = -0.0
pos = 0.0
print(z, str(z), repr(z), f"{z:.1f}")
print(z == pos, z == 0, math.copysign(1.0, z), math.copysign(1.0, pos))
s = z + 0.0
p = 0.0 * -1
q = -1 * 0
r = round(-0.4)
r1 = round(-0.4, 0)
a = abs(z)
i = int(z)
print(s, p, q, r, r1, a, i)
values = [z, pos, -z]
print(values)
print(max(z, pos), min(z, pos))
print(-0.0 < 0.0, 1 / float("inf") * -1)
