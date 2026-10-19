# The math module: constants, rounding, sqrt/hypot, gcd/lcm, factorial/comb, logs, isclose, inf and nan
import math
from math import pi, sqrt

print(math.pi, math.e, math.tau)
print(math.floor(-2.5), math.ceil(-2.5), round(-2.5), round(3.5), math.trunc(-2.7))
print(sqrt(16), math.sqrt(2), math.isqrt(17), math.hypot(3, 4))
print(math.gcd(48, 36), math.lcm(4, 6), math.factorial(10), math.comb(5, 2), math.perm(5, 2))
print(math.log(math.e), math.log(8, 2), math.log10(1000), math.log2(1024))
print(math.sin(pi / 2), math.cos(pi), math.degrees(pi), math.radians(180))
print(0.1 + 0.2 == 0.3, math.isclose(0.1 + 0.2, 0.3))
print(math.inf > 10**100, -math.inf, math.isinf(math.inf), math.isnan(math.nan))
print(math.fsum([0.1] * 10), sum([0.1] * 10))
print(math.pow(2, 10), 2 ** 10, math.fabs(-3), abs(-3))
area = pi * 3 ** 2
nan = float("nan")
print(round(area, 2), nan == nan, math.copysign(1, -0.0))
try:
    math.sqrt(-1)
except ValueError as e:
    print("ValueError:", e)
