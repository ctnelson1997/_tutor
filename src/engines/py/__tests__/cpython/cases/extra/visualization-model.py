"""What each step shows (#38): every variable in its place, classes with their
attributes, modules as one object, nothing a library adds."""
import json
from dataclasses import dataclass
from enum import Enum

__version__ = "1.0"
total: int = 0
list = [3, 1, 2]
max = 10


class Account:
    """A bank account."""
    rate = 0.02
    __slots__ = ("owner", "_balance", "__pin")

    def __init__(self, owner, pin):
        self.owner = owner
        self._balance = 0
        self.__pin = pin

    @property
    def balance(self):
        return self._balance

    @staticmethod
    def fee(amount):
        return amount * 0.01

    @classmethod
    def opened(cls, owner):
        return cls(owner, 1234)


class Savings(Account):
    __slots__ = ()

    def __init__(self, owner, pin):
        super().__init__(owner, pin)


@dataclass
class Point:
    x: int
    y: int = 0


class Color(Enum):
    RED = 1
    GREEN = 2


def describe(b, a):
    z = b + a
    y = z * 2
    return y


acct = Savings.opened("ada")
p = Point(1)
fav = Color.GREEN
del total
total = describe(2, 3)
print(json.dumps({"total": total, "x": p.x}), acct.balance, Account.fee(100), fav.value, max, list)
