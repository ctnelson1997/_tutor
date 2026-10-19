# Uses a Shape base class with Rectangle, Square and Circle subclasses to compare areas
import math


class Shape:
    def __init__(self, name):
        self.name = name

    def area(self):
        raise NotImplementedError

    def perimeter(self):
        raise NotImplementedError

    def describe(self):
        return f"{self.name}: area={self.area():.2f}, perimeter={self.perimeter():.2f}"


class Rectangle(Shape):
    def __init__(self, width, height):
        super().__init__("Rectangle")
        self.width = width
        self.height = height

    def area(self):
        return self.width * self.height

    def perimeter(self):
        return 2 * (self.width + self.height)


class Square(Rectangle):
    def __init__(self, side):
        super().__init__(side, side)
        self.name = "Square"


class Circle(Shape):
    def __init__(self, radius):
        super().__init__("Circle")
        self.radius = radius

    def area(self):
        return math.pi * self.radius ** 2

    def perimeter(self):
        return 2 * math.pi * self.radius


shapes = [Rectangle(3, 4), Square(5), Circle(2), Rectangle(1, 10)]
for shape in shapes:
    print(shape.describe())

biggest = max(shapes, key=lambda s: s.area())
print("Largest:", biggest.name)
print("Square is a Rectangle:", isinstance(shapes[1], Rectangle))
print("Circle is a Rectangle:", isinstance(shapes[2], Rectangle))
total_area = sum(s.area() for s in shapes)
print("Total area:", round(total_area, 3))

try:
    Shape("blob").area()
except NotImplementedError:
    print("Shape.area is abstract")
