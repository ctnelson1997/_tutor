# A generator function keeps its local state between next() calls; StopIteration at the end
def countdown(n):
    print("  start")
    while n > 0:
        yield n
        n -= 1
    print("  done")
    return "liftoff"

g = countdown(3)
print(type(g).__name__)
print(next(g))
print(next(g))
print(next(g))
try:
    next(g)
except StopIteration as e:
    print("StopIteration value:", e.value)
print(next(g, "exhausted"))

def evens_upto(limit):
    for i in range(limit + 1):
        if i % 2 == 0:
            yield i

gen = evens_upto(10)
first_two = [next(gen), next(gen)]
print(first_two, list(gen))
