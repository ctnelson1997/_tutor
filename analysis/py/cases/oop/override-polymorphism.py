# Method overriding and polymorphism over a list of shapes
import math

class Shape:
    def area(self):
        return 0

    def describe(self):
        return f"{type(self).__name__} with area {self.area():.2f}"

class Rect(Shape):
    def __init__(self, w, h):
        self.w = w
        self.h = h

    def area(self):
        return self.w * self.h

class Square(Rect):
    def __init__(self, side):
        super().__init__(side, side)

class Circle(Shape):
    def __init__(self, r):
        self.r = r

    def area(self):
        return math.pi * self.r ** 2

shapes = [Rect(2, 3), Square(4), Circle(1), Shape()]
total = 0
for s in shapes:
    print(s.describe())
    total += s.area()
print(round(total, 3))
biggest = max(shapes, key=lambda s: s.area())
print(type(biggest).__name__)
