# Diamond multiple inheritance: MRO order and cooperative super() calls
class Base:
    def __init__(self):
        print("Base init")
        self.trail = ["Base"]

    def hello(self):
        return "Base"

class Left(Base):
    def __init__(self):
        print("Left init")
        super().__init__()
        self.trail.append("Left")

    def hello(self):
        return "Left>" + super().hello()

class Right(Base):
    def __init__(self):
        print("Right init")
        super().__init__()
        self.trail.append("Right")

    def hello(self):
        return "Right>" + super().hello()

class Child(Left, Right):
    def __init__(self):
        print("Child init")
        super().__init__()
        self.trail.append("Child")

c = Child()
print(c.trail)
print(c.hello())
print([cls.__name__ for cls in Child.__mro__])
