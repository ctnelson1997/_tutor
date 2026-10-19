# An exception raised inside a generator reaches the consumer and finishes the generator; finally runs on close
def parse_all(lines):
    for line in lines:
        yield int(line)

def guarded(items):
    try:
        for item in items:
            yield 100 // item
    finally:
        print("  guarded cleanup")

gen = parse_all(["1", "2", "x", "4"])
got = []
try:
    for value in gen:
        got.append(value)
except ValueError as e:
    print("ValueError:", e)
print(got, next(gen, "finished"))

g2 = guarded([5, 0, 10])
print(next(g2))
try:
    next(g2)
except ZeroDivisionError as e:
    print("ZeroDivisionError:", e)
print(list(g2))

g3 = guarded([1, 2, 3])
print(next(g3))
g3.close()
try:
    g3.throw(KeyError("late"))
except KeyError as e:
    print("throw after close:", repr(e))
