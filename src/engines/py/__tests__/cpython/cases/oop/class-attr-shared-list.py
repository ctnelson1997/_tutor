# A mutable class attribute is shared by every instance (the classic bug) vs a per-instance list
class Basket:
    items = []            # shared by all baskets!

    def __init__(self, owner):
        self.owner = owner

    def add(self, item):
        self.items.append(item)

class FixedBasket:
    def __init__(self, owner):
        self.owner = owner
        self.items = []

    def add(self, item):
        self.items.append(item)

a = Basket("Ann")
b = Basket("Bob")
a.add("apple")
b.add("bread")
print(a.items, b.items, a.items is b.items)

c = FixedBasket("Cy")
d = FixedBasket("Di")
c.add("cheese")
d.add("dates")
print(c.items, d.items, c.items is d.items)
print(Basket.items)
