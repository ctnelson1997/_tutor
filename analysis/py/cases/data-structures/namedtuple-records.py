# Named tuples: fields by name and index, _replace/_asdict/_make, defaults, typing.NamedTuple, nesting
from collections import namedtuple
from typing import NamedTuple

Point = namedtuple("Point", "x y")
Color = namedtuple("Color", ["r", "g", "b"], defaults=[0])
p = Point(1, 2)
c = Color(255, 128)
print(p, c, c.b)
print(p[0] + p.y, len(c), tuple(c))
moved = p._replace(x=10)
print(moved, p)
print(Point._make([7, 8]), c._asdict())


class Student(NamedTuple):
    name: str
    grade: int = 9

    def label(self):
        return f"{self.name} (grade {self.grade})"


s1 = Student("Ann")
s2 = Student("Bo", 11)
print(s1, s2.label(), s1 < s2)
roster = [s2, s1, Student("Cy", 10)]
roster.sort(key=lambda s: s.grade)
print([s.name for s in roster])
Line = namedtuple("Line", "start end")
seg = Line(Point(0, 0), Point(3, 4))
dx = seg.end.x - seg.start.x
print(seg, dx, seg == ((0, 0), (3, 4)))
name, grade = s2
print(name, grade, Student._fields, Color._field_defaults)
try:
    p.x = 5
except AttributeError as e:
    print("AttributeError:", e)
