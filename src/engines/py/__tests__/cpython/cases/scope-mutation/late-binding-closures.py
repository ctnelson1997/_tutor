# closures made in a loop see the variable's final value (late binding); i=i defaults or a factory capture each value
funcs = []
for i in range(3):
    funcs.append(lambda: i)
print([f() for f in funcs])
fixed = []
for i in range(3):
    fixed.append(lambda i=i: i)
print([f() for f in fixed])

def make_multipliers():
    return [lambda x: x * k for k in range(4)]

print([m(2) for m in make_multipliers()])

def make_adder(n):
    def add(x):
        return x + n
    return add

adders = [make_adder(n) for n in range(3)]
print([a(10) for a in adders])
i = 100
print(funcs[0](), fixed[0]())
