# Computes weighted course grades and letter grades for a small class
WEIGHTS = {"homework": 0.25, "midterm": 0.30, "final": 0.45}


def weighted_average(scores):
    total = 0
    for category, weight in WEIGHTS.items():
        total += scores[category] * weight
    return round(total, 2)


def letter_grade(avg):
    if avg >= 90:
        return "A"
    elif avg >= 80:
        return "B"
    elif avg >= 70:
        return "C"
    elif avg >= 60:
        return "D"
    else:
        return "F"


students = {
    "Ana": {"homework": 95, "midterm": 88, "final": 92},
    "Ben": {"homework": 72, "midterm": 65, "final": 70},
    "Cho": {"homework": 85, "midterm": 91, "final": 78},
    "Dev": {"homework": 50, "midterm": 61, "final": 55},
}

report = {}
for name, scores in students.items():
    avg = weighted_average(scores)
    report[name] = (avg, letter_grade(avg))

for name in sorted(report):
    avg, letter = report[name]
    print(f"{name:<5}{avg:>7.2f}  {letter}")

averages = [avg for avg, _ in report.values()]
class_avg = sum(averages) / len(averages)
print("Class average:", round(class_avg, 2))

letter_counts = {}
for avg, letter in report.values():
    letter_counts[letter] = letter_counts.get(letter, 0) + 1
print("Distribution:", letter_counts)

best = max(report, key=lambda n: report[n][0])
print("Top student:", best)
