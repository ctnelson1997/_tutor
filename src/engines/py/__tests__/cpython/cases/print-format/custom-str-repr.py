# a class's __str__ is used by print/str/f-strings but containers use __repr__; a class with only __repr__ uses it for both
class Card:
    def __init__(self, rank, suit):
        self.rank = rank
        self.suit = suit
    def __str__(self):
        return f"{self.rank} of {self.suit}"
    def __repr__(self):
        return f"Card({self.rank!r}, {self.suit!r})"

class Point:
    def __init__(self, x, y):
        self.x, self.y = x, y
    def __repr__(self):
        return f"Point({self.x}, {self.y})"

c = Card("Q", "hearts")
print(c)
print(str(c), repr(c))
print(f"{c} / {c!r}")
hand = [c, Card(10, "spades")]
print(hand)
print(hand[1])
p = Point(1, 2)
print(p, [p], str(p))
print("%s %r" % (c, c))
print("{} {!r}".format(c, p))
table = {"top": c, "pos": p}
print(table)
