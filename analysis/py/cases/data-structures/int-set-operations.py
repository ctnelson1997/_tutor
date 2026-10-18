# Sets of ints: union/intersection/difference/symmetric difference, add/discard/remove, subsets, -1 vs -2 hashing
evens = {0, 2, 4, 6, 8}
primes = {2, 3, 5, 7}
print(evens | primes)
print(evens & primes, evens - primes, primes - evens)
print(evens ^ primes)
seen = set()
for n in [3, 1, 3, 2, 1]:
    seen.add(n)
print(seen, len(seen))
seen.discard(10)
seen.remove(1)
print(seen)
try:
    seen.remove(99)
except KeyError as e:
    print("KeyError:", e)
small = {2, 3}
print(small <= primes, small < small, primes.issuperset(small), evens.isdisjoint({1, 3}))
negatives = {-1, -2, -3, 100, 33}
print(negatives, sorted(negatives), hash(-1) == hash(-2))
evens |= {10}
primes &= {2, 3, 11}
print(evens, primes)
popped = primes.pop()
print(popped, primes)
unique = len(set([5, 5, 6, 7, 7, 7]))
squares = {n * n for n in range(-3, 4)}
print(unique, squares, 9 in squares)
empty = set()
print(empty, type({}).__name__, {True, 1, 1.0, 0, False})
