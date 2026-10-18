# __slots__: attributes live in slots (no __dict__), new attributes are refused, slots in a subclass
class Pixel:
    __slots__ = ("x", "y", "color")

    def __init__(self, x, y, color="black"):
        self.x = x
        self.y = y
        self.color = color

class AlphaPixel(Pixel):
    __slots__ = ("alpha",)

    def __init__(self, x, y, alpha):
        super().__init__(x, y, "white")
        self.alpha = alpha

class Partial:
    __slots__ = ("a", "b")

p = Pixel(3, 4)
p.color = "red"
print(p.x, p.y, p.color, hasattr(p, "__dict__"))
try:
    p.z = 5
except AttributeError as e:
    print("AttributeError:", e)
ap = AlphaPixel(1, 1, 0.5)
print(ap.x, ap.color, ap.alpha)
q = Partial()
q.a = 1          # q.b is never set
print(q.a, hasattr(q, "b"))
pixels = [Pixel(i, i * 2) for i in range(3)]
print([(px.x, px.y) for px in pixels])
