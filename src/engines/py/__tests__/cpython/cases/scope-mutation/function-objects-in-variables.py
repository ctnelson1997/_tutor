# functions, lambdas, builtins and methods held in variables, dicts and lists; rebinding a name leaves other references intact
def add(a, b):
    return a + b

def sub(a, b):
    return a - b

f = add
print(f(2, 3), f is add, f.__name__)
ops = {"+": add, "-": sub, "*": lambda a, b: a * b}
for sym in ["+", "-", "*"]:
    print(sym, ops[sym](7, 3))
pipeline = [str.upper, str.strip, len]
value = "  hello  "
for step in pipeline[:2]:
    value = step(value)
print(repr(value), pipeline[2](value))
measure = len
print(measure([1, 2, 3]), measure is len)

def apply_twice(func, x):
    return func(func(x))

print(apply_twice(lambda n: n * n, 3))
add = sub
print(add(5, 1), f(5, 1), ops["+"](5, 1))
callbacks = [print]
callbacks[0]("called print via list")
method = "a-b-c".split
print(method("-"))
