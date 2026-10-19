# Converts temperatures typed as "<value> <unit>" until the user types quit
def convert(value, unit):
    unit = unit.upper()
    if unit == "C":
        return value * 9 / 5 + 32, "F"
    elif unit == "F":
        return (value - 32) * 5 / 9, "C"
    elif unit == "K":
        return value - 273.15, "C"
    return None, None


conversions = []
while True:
    entry = input("Temperature (e.g. 100 C) or quit: ").strip()
    if entry.lower() == "quit":
        break
    parts = entry.split()
    if len(parts) != 2:
        print("Please type a number and a unit")
        continue
    value = float(parts[0])
    result, new_unit = convert(value, parts[1])
    if result is None:
        print("Unknown unit:", parts[1])
        continue
    conversions.append((value, parts[1].upper(), round(result, 1), new_unit))
    print(f"{value} {parts[1].upper()} = {result:.1f} {new_unit}")

print()
print("Converted", len(conversions), "temperatures")
for original, unit, converted, new_unit in conversions:
    print(f"  {original:>7} {unit} -> {converted:>6} {new_unit}")
