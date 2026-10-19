# Operator overloading: __add__, __sub__, __mul__/__rmul__, __neg__, __eq__, __abs__
class Vector:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __add__(self, other):
        return Vector(self.x + other.x, self.y + other.y)

    def __sub__(self, other):
        return Vector(self.x - other.x, self.y - other.y)

    def __mul__(self, k):
        return Vector(self.x * k, self.y * k)

    __rmul__ = __mul__

    def __neg__(self):
        return Vector(-self.x, -self.y)

    def __eq__(self, other):
        return self.x == other.x and self.y == other.y

    def __abs__(self):
        return (self.x ** 2 + self.y ** 2) ** 0.5

    def __repr__(self):
        return f"Vector({self.x}, {self.y})"

a = Vector(1, 2)
b = Vector(3, 4)
c = a + b
d = b - a
e = 2 * a
f = a * 3
g = -b
print(c, d, e, f, g)
print(abs(b), a + b == Vector(4, 6), a == b)
total = sum([a, b, c], Vector(0, 0))
print(total)
a += b      # no __iadd__: rebinds a to a new object
print(a, a is c)
