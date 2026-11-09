# Heap objects drawn as what they hold (#81): containers past what is drawn,
# library containers and values, subclasses, sets, iterators, generators.
import collections
import functools
from collections import Counter, OrderedDict, defaultdict, deque, namedtuple
from datetime import date
from decimal import Decimal
from fractions import Fraction
from random import randint


class Stack(list):
    def __init__(self, name):
        super().__init__()
        self.name = name


nums = list(range(150))
queue = deque([1, 2, 3])
r = range(0, 10, 2)
f = Fraction(3, 4)
dec = Decimal("1.10")
day = date(2024, 1, 2)
b = b"abc"
s = Stack("plates")
s.append(1)
c = Counter("hello")
dd = defaultdict(list)
dd["a"].append(1)
od = OrderedDict(a=1, b=2, c=3)
od.move_to_end("a")
Point = namedtuple("Point", "x y")
p = Point(1, 2)
st = {3, 1, 2}
fs = frozenset({1})
keys = od.keys()
it = iter([10, 20, 30])
next(it)
z = zip([1], [2])
err = ValueError("bad", 3)


def gen():
    total = 0
    for i in range(3):
        total += i
        yield total


g = gen()
next(g)


@functools.lru_cache
def fib(n):
    return n if n < 2 else fib(n - 1) + fib(n - 2)


fib(5)
m = s.append
ri = randint
print(len(nums), list(queue), list(r), f, dec, day, b, s, c, dict(dd), list(od), p, sorted(st), keys, next(it), next(z), err, next(g), fib.cache_info().currsize)
