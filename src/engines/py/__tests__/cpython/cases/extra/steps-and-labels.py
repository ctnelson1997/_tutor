# The steps CPython's events give (#80): returns after a handled exception, a
# multi-line comprehension, caught exceptions, yields, class bodies, nonlocal.
from contextlib import suppress


class Countdown:
    def __init__(self, start):
        self.n = start

    def __iter__(self):
        return self

    def __next__(self):
        if self.n == 0:
            raise StopIteration
        self.n -= 1
        return self.n + 1


def show(it):
    for x in it:
        print(x)


def parse(s):
    with suppress(ValueError):
        return int(s)


show(Countdown(2))
print(parse("x"))
data = [3, -1, 2]
result = [
    x * 2
    for x in data
    if x > 0
]
try:
    int("abc")
except ValueError as e:
    print("bad", e)


def gen():
    yield 1
    yield 2


print(list(gen()))


class Base:
    def hello(self):
        return "base"


class Child(Base):
    def hello(self):
        return super().hello() + "!"


print(Child().hello())


def outer():
    count = 0

    def inc():
        nonlocal count
        count += 1

    inc()
    inc()
    return count


print(outer())


class Oops(Exception):
    def __str__(self):
        print("__str__ ran")
        return "oops"


def risky():
    raise Oops("plain")


try:
    risky()
except Oops:
    print("caught")
for y in Countdown(1):
    pass
