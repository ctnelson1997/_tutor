# __eq__ and __hash__: equal objects deduplicated in a set and usable as dict keys
class Card:
    def __init__(self, rank, suit):
        self.rank = rank
        self.suit = suit

    def __eq__(self, other):
        return isinstance(other, Card) and (self.rank, self.suit) == (other.rank, other.suit)

    def __hash__(self):
        return hash((self.rank, self.suit))

    def __repr__(self):
        return f"{self.rank}{self.suit}"

class NoHash:
    def __init__(self, v):
        self.v = v

    def __eq__(self, other):
        return self.v == other.v

hand = [Card(10, "H"), Card(3, "S"), Card(10, "H"), Card(3, "S"), Card(1, "D")]
unique = set(hand)
print(len(unique))
print(sorted(unique, key=lambda c: (c.rank, c.suit)))
counts = {}
for c in hand:
    counts[c] = counts.get(c, 0) + 1
print(counts)
print(Card(1, "D") in unique, Card(1, "D") == Card(1, "D"), Card(1, "D") is Card(1, "D"))
print(NoHash(1) == NoHash(1), NoHash.__hash__ is None)
try:
    s = {NoHash(1)}
except TypeError as e:
    print("TypeError:", e)
