# numeric format specs: .3f, thousands separators (, and _), 08.2f, x/X/#x, b/#b, o, %, e, g, +, space
x = 3.14159265
big = 1234567.891
n = 255
frac = 0.4567
print(f"{x:.3f} {x:.0f} {x:.10f}")
print(f"{big:,} {big:,.2f} {1000000:,} {1000000:_}")
print(f"{x:08.2f} {-x:08.2f} {7:08.2f}")
print(f"{n:x} {n:X} {n:#x} {n:#X} {n:04x}")
print(f"{n:b} {n:#b} {5:08b} {n:o} {n:#o}")
print(f"{frac:%} {frac:.1%} {1:.0%} {0.005:.1%}")
print(f"{big:e} {big:.2e} {0.000123:E}")
print(f"{big:g} {0.0001234:g} {1e20:g} {100.0:g}")
print(f"{n:+d} {-n:+d} {n: d} {-n: d}")
print(f"{2.5:.0f} {3.5:.0f} {0.125:.2f} {0.375:.2f}")
print(f"{1e16:f} {1/3:.20f}")
print(f"{12345678901234567890:,}")
print(f"{n:c} {65:c}")
print(format(x, ".2f"), format(n, "08b"), format(big, ",.1f"))
