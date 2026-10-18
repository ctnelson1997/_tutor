# Lambdas stored in variables, a dict of operations, and a list of lambdas called in a loop
square = lambda x: x * x
add = lambda a, b=10: a + b
ops = {
    "+": lambda a, b: a + b,
    "-": lambda a, b: a - b,
    "*": lambda a, b: a * b,
    "/": lambda a, b: a / b if b else None,
}

print(square(7), add(1), add(1, 2))
for symbol in ["+", "-", "*", "/"]:
    print(6, symbol, 3, "=", ops[symbol](6, 3))
print(ops["/"](1, 0))
pipeline = [lambda s: s.strip(), str.upper, lambda s: s.replace(" ", "_")]
text = "  hello world  "
for step in pipeline:
    text = step(text)
print(text)
print((lambda: "called right away")())
print(square.__name__, len(ops))
