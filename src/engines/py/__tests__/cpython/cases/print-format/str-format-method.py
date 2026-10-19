# str.format: positional/indexed/keyword fields, attribute and item access, nested width fields, {{ }} escapes
template = "{} + {} = {}"
print(template.format(2, 3, 2 + 3))
print("{1} {0} {1}".format("a", "b"))
print("{name} is {age} years".format(name="Bo", age=7))
point = {"x": 3, "y": -4}
print("x={0[x]}, y={0[y]}".format(point))
coords = [10, 20, 30]
print("first={0[0]} last={0[2]}".format(coords))
c = 2 + 3j
print("real={0.real} imag={0.imag}".format(c))
print("{:>{w}}|{:<{w}}|".format("r", "l", w=5))
print("{:{fill}^{width}}".format("mid", fill="=", width=11))
print("{{}} braces and {}".format("value"))
print("{0!r} {0!s}".format("quoted"))
print("{:.2%} {:,d} {:e}".format(0.256, 9876543, 0.5))
data = {"user": "kim", "n": 3}
print("{user} has {n} items".format(**data))
args = ["p", "q"]
print("{} then {}".format(*args))
line = "{:<6}{:>6.1f}".format("pi", 3.14159)
print(repr(line), len(line))
