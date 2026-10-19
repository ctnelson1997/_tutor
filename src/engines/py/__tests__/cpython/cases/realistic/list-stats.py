# Computes max, min, average, median and range of a list without built-in helpers
def find_max(values):
    biggest = values[0]
    for v in values[1:]:
        if v > biggest:
            biggest = v
    return biggest


def find_min(values):
    smallest = values[0]
    for v in values:
        if v < smallest:
            smallest = v
    return smallest


def average(values):
    total = 0
    for v in values:
        total += v
    return total / len(values)


def median(values):
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 0:
        return (ordered[mid - 1] + ordered[mid]) / 2
    return ordered[mid]


temps = [68, 74, 59, 81, 77, 63, 70, 85]
hi = find_max(temps)
lo = find_min(temps)
avg = average(temps)
print("Temperatures:", temps)
print("Max:", hi, "Min:", lo, "Range:", hi - lo)
print("Average:", avg)
print("Median:", median(temps))
print("Matches built-ins:", hi == max(temps) and lo == min(temps))

above = [t for t in temps if t > avg]
below = [t for t in temps if t <= avg]
print("Above average:", above)
print("At or below:", below)
index_of_max = temps.index(hi)
print("Hottest day is day", index_of_max + 1)
odd_median = median(temps[:5])
print("Median of first five:", odd_median)
