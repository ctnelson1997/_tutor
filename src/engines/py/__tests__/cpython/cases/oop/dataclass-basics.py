# @dataclass with defaults and field(default_factory=list): generated __init__, __repr__, __eq__
from dataclasses import dataclass, field

@dataclass
class Item:
    name: str
    price: float
    qty: int = 1

@dataclass
class Order:
    customer: str
    items: list = field(default_factory=list)
    paid: bool = False

    def total(self):
        return sum(i.price * i.qty for i in self.items)

o1 = Order("Ann")
o2 = Order("Bob")
o1.items.append(Item("pen", 1.5, 4))
o1.items.append(Item("book", 12.0))
print(o1)
print(o2)
print(o1.total(), o2.total())
print(Item("pen", 1.5, 4) == o1.items[0], Item("pen", 1.5) == o1.items[0])
o2.paid = True
print(o2.paid, o1.paid, o1.items is o2.items)
