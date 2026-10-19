# adding 0.1 ten times in a loop: each step's float (0.30000000000000004, 0.7999999999999999, ...) must show exactly
import math
total = 0.0
for i in range(10):
    total += 0.1
    print(i, total)
print(total == 1.0, math.isclose(total, 1.0), repr(total))
cents = 0
for i in range(10):
    cents += 10
print(cents / 100, cents / 100 == 1.0)
x = 1.1 * 3
y = 0.1 * 3
z = 4.35 * 100
print(x, y, z, int(z), round(z))
balance = 100.0
for rate in [0.05, 0.05, 0.05]:
    balance *= 1 + rate
print(balance, round(balance, 2))
