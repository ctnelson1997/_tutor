# a comprehension whose element has side effects: each element must be computed exactly once
calls = []
def f(x):
    calls.append(x)
    return x * 10
ys = [f(x) for x in range(3)]
print(ys, calls)
it = iter([1, 2, 3, 4])
pairs = [(a, next(it)) for a in it]
print(pairs)
log = [print("item", n) for n in range(2) if n >= 0]
print(len(log))
