# ends uncaught: a KeyError raised inside a method called from another method
class Inventory:
    def __init__(self):
        self.counts = {"apple": 3, "pear": 1}

    def take(self, item, n):
        if self.counts[item] < n:
            return False
        self.counts[item] -= n
        return True

    def fill_order(self, order):
        filled = []
        for item, n in order:
            if self.take(item, n):
                filled.append(item)
        return filled

inv = Inventory()
print(inv.fill_order([("apple", 2), ("pear", 5)]))
print(inv.counts)
print(inv.fill_order([("apple", 1), ("kiwi", 1)]))
print("never printed")
