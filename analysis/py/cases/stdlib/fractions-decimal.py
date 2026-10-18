# fractions.Fraction arithmetic and decimal.Decimal vs float rounding
from fractions import Fraction
from decimal import Decimal, ROUND_HALF_UP

half = Fraction(1, 2)
third = Fraction(1, 3)
total = half + third
print(total, repr(total), total.numerator, total.denominator)
print(Fraction(6, 8), Fraction("0.75"), Fraction(0.1), Fraction(0.1).limit_denominator(100))
print(half * 4, half ** 2, float(third), third < half, Fraction(3, 1) == 3)
recipe = [Fraction(3, 4), Fraction(2, 3), Fraction(1, 6)]
print(sum(recipe), sum(recipe) * 3)
print(0.1 + 0.2, Decimal("0.1") + Decimal("0.2"), Decimal(0.1))
price = Decimal("19.995")
print(price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP), round(2.675, 2), round(Decimal("2.675"), 2))
print(Decimal(10) / Decimal(3), Decimal("1.10") * 3)
