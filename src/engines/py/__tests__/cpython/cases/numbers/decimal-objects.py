# Decimal values in variables: exact decimal arithmetic, Decimal(0.1)'s exact expansion, quantize with ROUND_HALF_UP, a local precision
from decimal import Decimal, ROUND_HALF_UP, localcontext
a = Decimal("0.1")
b = Decimal("0.2")
c = a + b
print(c, repr(c), c == Decimal("0.3"))
d = Decimal(0.1)
print(d)
price = Decimal("2.675")
rounded = price.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
bankers = price.quantize(Decimal("0.01"))
print(rounded, bankers)
with localcontext() as ctx:
    ctx.prec = 6
    seventh = Decimal(1) / Decimal(7)
print(seventh, Decimal(1) / Decimal(7))
total = Decimal("1.30") + Decimal("1.20")
print(total, total.normalize(), [a, total])
sci = Decimal("1e3")
small = Decimal(10) ** -2
print(sci, small, sci + 1, Decimal("-0"))
print(float(c), int(Decimal("7.9")), str(Decimal("1.500")))
cart = {"apple": Decimal("0.35"), "pear": Decimal("1.05")}
print(sum(cart.values()), cart)
