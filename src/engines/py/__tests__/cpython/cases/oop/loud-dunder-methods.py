# Classes whose __getattribute__, __getattr__, __len__, __getitem__, __iter__, __repr__, __str__ and __eq__ print:
# drawing them must call none of them, so only the program's own calls print
class Loud:
    def __init__(self):
        self.x = 1

    def __getattribute__(self, name):
        print("getattribute", name)
        return object.__getattribute__(self, name)

    def __repr__(self):
        print("repr called")
        return "Loud()"

    def __str__(self):
        print("str called")
        return "loud"

    def __eq__(self, other):
        print("eq called")
        return True

    __hash__ = object.__hash__


class LoudList(list):
    def __len__(self):
        print("len called")
        return list.__len__(self)

    def __getitem__(self, i):
        print("getitem", i)
        return list.__getitem__(self, i)

    def __iter__(self):
        print("iter called")
        return list.__iter__(self)


class Slotted:
    __slots__ = ("a", "__b", "unset")

    def __init__(self):
        self.a = 1
        self.__b = 2

    def __getattr__(self, name):
        print("getattr", name)
        raise AttributeError(name)


obj = Loud()
items = LoudList([3, 4])
s = Slotted()
table = {obj: "loud key", (1, "two"): "tuple key"}
print("done", object.__getattribute__(obj, "x"), list.__len__(items))
print(s.a)
