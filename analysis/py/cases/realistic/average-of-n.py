# Reads how many measurements to expect, then that many floats, and prints statistics
import math

n = int(input("How many measurements? "))
readings = []
for i in range(n):
    value = float(input(f"Measurement {i + 1}: "))
    readings.append(value)

mean = sum(readings) / n
variance = sum((x - mean) ** 2 for x in readings) / n
std_dev = math.sqrt(variance)

print()
print("Readings:", readings)
print(f"Mean: {mean:.3f}")
print(f"Standard deviation: {std_dev:.3f}")
print("Min:", min(readings), "Max:", max(readings))
outliers = [x for x in readings if abs(x - mean) > 1.5 * std_dev]
print("Outliers:", outliers)
rounded = [round(x) for x in readings]
print("Rounded:", rounded)
