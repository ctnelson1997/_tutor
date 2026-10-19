# int() truncates toward zero and parses strings (bases, underscores, whitespace); floor/ceil/trunc differ for negatives
import math
a = int(3.9)
b = int(-3.9)
c = int("42")
d = int(" 7 \n")
e = int("ff", 16)
f = int("0b101", 0)
g = int("0o17", 0)
h = int("1_000")
print(a, b, c, d, e, f, g, h, int(True))
print(math.floor(-3.5), math.ceil(-3.5), math.trunc(-3.5), round(-3.5))
print(math.floor(3.5), math.ceil(3.5), math.trunc(3.5))
try:
    bad = int("3.5")
except ValueError as err:
    print("ValueError:", err)
fl = float("  2.5  ")
sci = float("1e3")
print(fl, sci, int(sci))
exact = int(1e23)
print(exact, int(2.5e20), int(-1e20))
print(int("-0"), int("+12"), int("z", 36))
