# Infinite generators consumed with itertools.islice, takewhile and count
from itertools import islice, count, takewhile

def fibonacci():
    a, b = 0, 1
    while True:
        yield a
        a, b = b, a + b

def primes():
    found = []
    for n in count(2):
        if all(n % p for p in found):
            found.append(n)
            yield n

print(list(islice(fibonacci(), 10)))
print(list(islice(fibonacci(), 5, 12, 2)))
print(list(takewhile(lambda x: x < 30, primes())))
fib = fibonacci()
for _ in range(5):
    next(fib)
print(next(fib), next(fib))
squares = (n * n for n in count(1))
print(list(islice(squares, 4)), next(squares))
