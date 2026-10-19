# Recursion that builds and returns functions: compose n times, curried add, and a power tower
def compose(f, n):
    if n == 0:
        return lambda x: x
    rest = compose(f, n - 1)
    return lambda x: f(rest(x))

def curry_add(count, total=0):
    if count == 0:
        return total
    return lambda x: curry_add(count - 1, total + x)

inc = lambda x: x + 1
add5 = compose(inc, 5)
dbl3 = compose(lambda x: x * 2, 3)
print(add5(10), dbl3(1))
print(curry_add(3)(1)(2)(3))
step = curry_add(2)
half = step(10)
print(callable(half), half(5))

def counter_chain(n):
    if n == 0:
        return []
    return counter_chain(n - 1) + [lambda: n]

fs = counter_chain(3)
print([f() for f in fs])
