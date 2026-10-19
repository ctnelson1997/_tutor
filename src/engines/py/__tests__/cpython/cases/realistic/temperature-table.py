# Prints Celsius/Fahrenheit/Kelvin conversion tables using functions with default arguments
def c_to_f(c):
    return c * 9 / 5 + 32


def f_to_c(f):
    return (f - 32) * 5 / 9


def c_to_k(c):
    return c + 273.15


def table(start, stop, step=10, unit="C"):
    rows = []
    for t in range(start, stop + 1, step):
        if unit == "C":
            rows.append((t, round(c_to_f(t), 1), round(c_to_k(t), 2)))
        else:
            c = f_to_c(t)
            rows.append((t, round(c, 1), round(c_to_k(c), 2)))
    return rows


print("Celsius table")
celsius_rows = table(-20, 40)
for c, f, k in celsius_rows:
    print(f"{c:>5} C = {f:>6} F = {k:>7} K")

print()
print("Fahrenheit table")
fahrenheit_rows = table(32, 212, step=45, unit="F")
for f, c, k in fahrenheit_rows:
    print(f"{f:>5} F = {c:>6} C = {k:>7} K")

freezing = [row for row in celsius_rows if row[1] <= 32]
print("At or below freezing:", len(freezing), "rows")
hottest = celsius_rows[-1]
print("Hottest row:", hottest)
body_temp = c_to_f(37)
print("Body temperature:", body_temp, "F")
