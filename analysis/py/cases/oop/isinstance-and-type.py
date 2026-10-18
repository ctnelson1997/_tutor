# isinstance vs type() ==, issubclass, type names, bool being an int, and __name__ == "__main__"
class Vehicle:
    pass

class Car(Vehicle):
    pass

class Truck(Vehicle):
    pass

def kind(x):
    if isinstance(x, bool):
        return "bool"
    if isinstance(x, (int, float)):
        return "number"
    if isinstance(x, Vehicle):
        return "vehicle:" + type(x).__name__
    return type(x).__name__

def main():
    things = [3, 2.5, True, "hi", Car(), Truck(), [1], None]
    print([kind(t) for t in things])
    c = Car()
    print(isinstance(c, Vehicle), type(c) == Vehicle, type(c) is Car)
    print(issubclass(Car, Vehicle), issubclass(Vehicle, Car), issubclass(bool, int))
    print(type(c))
    print(type(5), type("s"), type(None))
    print(isinstance(True, int), True + True)
    print(__name__)

if __name__ == "__main__":
    main()
