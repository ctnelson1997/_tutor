# __str__ vs __repr__: print(obj), print of a list of objects, f-strings with !r, str() and repr()
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __repr__(self):
        return f"Point({self.x}, {self.y})"

    def __str__(self):
        return f"({self.x}, {self.y})"

class OnlyRepr:
    def __repr__(self):
        return "OnlyRepr()"

p = Point(1, 2)
q = Point(-3, 4)
print(p)
print([p, q])
print(f"{p} and {p!r}")
print(str(q), repr(q))
print({"origin": Point(0, 0)})
o = OnlyRepr()
print(o, str(o), [o])
print((p,))
label = "point: " + str(p)
print(label)
