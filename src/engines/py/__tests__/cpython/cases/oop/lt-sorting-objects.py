# __lt__ lets sorted/min/max order objects; total_ordering fills in the rest
from functools import total_ordering

@total_ordering
class Student:
    def __init__(self, name, gpa):
        self.name = name
        self.gpa = gpa

    def __eq__(self, other):
        return self.gpa == other.gpa

    def __lt__(self, other):
        return self.gpa < other.gpa

    def __repr__(self):
        return f"{self.name}:{self.gpa}"

roster = [Student("Ann", 3.2), Student("Bo", 3.9), Student("Cy", 2.8), Student("Di", 3.2)]
print(sorted(roster))
print(sorted(roster, reverse=True))
print(min(roster), max(roster))
print(roster[0] <= roster[3], roster[1] >= roster[2], roster[0] == roster[3])
roster.sort(key=lambda s: s.name, reverse=True)
print(roster)
top = sorted(roster)[-1]
