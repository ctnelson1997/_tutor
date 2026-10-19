# Closures: independent counters with nonlocal, a closure over a loop variable (late binding) and the fix
def make_counter(start=0):
    count = start
    def increment(step=1):
        nonlocal count
        count += step
        return count
    return increment

a = make_counter()
b = make_counter(100)
print(a(), a(), a(5))
print(b(), a())
print(a.__closure__[0].cell_contents, b.__code__.co_freevars)

late = [lambda: i for i in range(3)]
fixed = [lambda i=i: i for i in range(3)]
print([f() for f in late], [f() for f in fixed])

def make_multiplier(n):
    return lambda x: x * n

double, triple = make_multiplier(2), make_multiplier(3)
print(double(7), triple(7))
