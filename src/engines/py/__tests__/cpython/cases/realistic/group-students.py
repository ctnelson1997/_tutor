# Groups student records by major and year with dictionaries and computes per-group GPA
students = [
    ("Alice", "CS", 2, 3.6),
    ("Bob", "Math", 3, 3.1),
    ("Carmen", "CS", 1, 3.9),
    ("Dmitri", "Biology", 2, 2.8),
    ("Eun", "Math", 2, 3.4),
    ("Farah", "CS", 3, 3.2),
    ("Gus", "Biology", 1, 3.5),
]

by_major = {}
for name, major, year, gpa in students:
    if major not in by_major:
        by_major[major] = []
    by_major[major].append(name)

gpa_totals = {}
for _, major, _, gpa in students:
    total, count = gpa_totals.get(major, (0.0, 0))
    gpa_totals[major] = (total + gpa, count + 1)

print("Majors:")
for major in sorted(by_major):
    total, count = gpa_totals[major]
    print(f"  {major:<8} {count} students, avg GPA {total / count:.2f}: {', '.join(by_major[major])}")

by_year = {}
for record in students:
    by_year.setdefault(record[2], []).append(record[0])
print("By year:", dict(sorted(by_year.items())))

honors = {name: gpa for name, _, _, gpa in students if gpa >= 3.5}
print("Honors:", honors)

cs_second_years = [name for name, major, year, _ in students if major == "CS" and year >= 2]
print("CS, year 2+:", cs_second_years)

largest = max(by_major, key=lambda m: len(by_major[m]))
print("Largest major:", largest)
