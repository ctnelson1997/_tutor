# Dict comprehensions: filtering, inverting, from zip, duplicate keys keep the last value, inside a function
prices = {"tea": 3, "cake": 5, "pie": 4, "jam": 2}
cheap = {item: p for item, p in prices.items() if p <= 3}
print(cheap)
doubled = {k: v * 2 for k, v in prices.items()}
print(doubled)
names = ["ann", "bob", "cy"]
lengths = {n: len(n) for n in names}
print(lengths)
squares = {i: i * i for i in range(-2, 3)}
print(squares)
last_wins = {len(w): w for w in ["hi", "yo", "hey", "ok"]}
print(last_wins)
table = {r: {c: r * c for c in range(1, 4)} for r in range(1, 3)}
print(table)
zipped = dict(zip(names, [90, 85, 77]))
passed = {n: s for n, s in zipped.items() if s >= 80}
print(zipped, passed)


def invert(d):
    flipped = {v: k for k, v in d.items()}
    return flipped


by_price = invert(prices)
print(by_price)
print(invert({"a": 1, "b": 1}))
