# Reads a line of quiz scores with input().split(), drops the lowest, and curves the rest
line = input("Enter quiz scores separated by spaces: ")
scores = [int(s) for s in line.split()]
print("Scores:", scores)

lowest = min(scores)
kept = scores.copy()
kept.remove(lowest)
print("Dropped lowest score:", lowest)

average = sum(kept) / len(kept)
print("Average of the rest:", round(average, 2))

target = 85
curve = max(0, round(target - average))
curved = [min(100, s + curve) for s in kept]
print("Curve:", curve, "points")
print("Curved:", curved)

name, section = input("Name and section: ").split()
section = int(section)
print(f"{name} (section {section}) final average: {sum(curved) / len(curved):.1f}")
passed = all(s >= 60 for s in curved)
print("Passed every quiz:", passed)
