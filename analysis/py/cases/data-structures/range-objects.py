# range objects in variables: len, indexing, slicing gives a range, membership, reversed, equality, empty ranges
r = range(2, 20, 3)
print(r, len(r), r[0], r[-1], r[2])
print(list(r), 11 in r, 12 in r)
part = r[1:4]
print(part, list(part), type(part).__name__)
back = r[::-1]
print(back, list(back))
empty = range(5, 1)
print(empty, len(empty), list(empty), bool(empty))
print(range(0, 6, 2) == range(0, 5, 2), range(0) == range(3, 3))
down = range(10, 0, -4)
print(list(down), down.start, down.stop, down.step)
print(r.index(14), r.count(5), sum(r), max(r))
rev = reversed(range(4))
print(list(rev))
big = range(10**9)
print(len(big), big[-1], 10**8 in big)
total = 0
for i in range(1, 6):
    total += i
print(total, i)
try:
    r[100]
except IndexError as e:
    print("IndexError:", e)
