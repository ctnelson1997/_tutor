# A list of tuples sorted by several keys: plain tuple order, itemgetter, stable multi-pass sorts, mixed directions
from operator import itemgetter

students = [
    ("Cy", "B", 88),
    ("Ann", "A", 92),
    ("Bo", "B", 75),
    ("Di", "A", 92),
    ("Ed", "C", 75),
]
print(sorted(students))
by_grade = sorted(students, key=itemgetter(1))
print(by_grade)
by_grade_score = sorted(students, key=itemgetter(1, 2))
print(by_grade_score)
staged = sorted(students, key=itemgetter(0), reverse=True)
staged.sort(key=itemgetter(2), reverse=True)
print(staged)
mixed = sorted(students, key=lambda t: (-t[2], t[0]))
print([name for name, _, _ in mixed])
students.sort(key=lambda t: t[1])
students.sort(key=lambda t: t[2], reverse=True)
print(students)
top = students[0]
name, grade, score = top
print(name, grade, score)
getter = itemgetter(2, 0)
print(getter(top), max(students, key=itemgetter(2)))
