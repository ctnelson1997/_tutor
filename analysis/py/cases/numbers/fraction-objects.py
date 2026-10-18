# Fraction values in variables: automatic reduction, from strings and floats, limit_denominator, sums of unit fractions
from fractions import Fraction
a = Fraction(1, 3)
b = Fraction(1, 6)
c = a + b
print(a, b, c, repr(c))
d = Fraction("0.75")
e = Fraction(6, 4)
f = Fraction(0.1)
print(d, e, f)
approx = f.limit_denominator(10)
print(approx, approx == Fraction(1, 10))
print(c.numerator, c.denominator, float(a), a * 3 == 1)
harmonic = Fraction(0)
for n in range(1, 6):
    harmonic += Fraction(1, n)
    print(n, harmonic)
print([a, d], {"half": c})
print(Fraction(-3, 9), Fraction(5), Fraction(1, 3) < 0.34, a ** 2)
mixed = a + 1
floaty = a + 0.5
print(mixed, floaty)
