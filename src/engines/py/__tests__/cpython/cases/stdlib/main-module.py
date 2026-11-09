# The program runs as python main.py runs it: as the __main__ module (#77).
import pickle
import sys


class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y


p = pickle.loads(pickle.dumps(Point(3, 4)))
print(p.x, p.y)
print(sys.modules["__main__"].Point is Point)
print(type(__builtins__).__name__, __doc__, __file__, sys.argv)
print([name for name in dir() if name.startswith("__")])
