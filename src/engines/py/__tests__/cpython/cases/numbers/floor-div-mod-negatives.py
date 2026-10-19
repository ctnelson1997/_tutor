# true division always gives a float; // and % floor toward negative infinity (ints and floats), unlike int() and math.fmod
half = 1 / 2
whole = 4 / 2
third = 10 / 3
print(half, whole, third, type(whole).__name__)
print(7 // 2, -7 // 2, 7 // -2, -7 // -2)
print(7 % 3, -7 % 3, 7 % -3, -7 % -3)
print(7.5 // 2, -7.5 // 2, 7.5 % 2, -7.5 % 2)
print(int(-7 / 2), -7 // 2, int(7 / 2))
import math
print(math.fmod(-7, 3), -7 % 3)
print(-1 // 10, -1 % 10, 0 // 5, -0 // 5)
q = -17 // 5
r = -17 % 5
print(q, r, q * 5 + r)
minutes = -125
hours, mins = minutes // 60, minutes % 60
print(hours, mins)
print(6 / 3 == 2, 1 // 1.0, 2 ** 0.5 // 1)
