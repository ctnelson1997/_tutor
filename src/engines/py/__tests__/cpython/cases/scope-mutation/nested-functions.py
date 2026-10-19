# three levels of nested functions reading enclosing variables, function composition, and a returned inner function's qualname
def outer(a):
    b = a * 2
    def middle(c):
        d = b + c
        def inner(e):
            return a + b + c + d + e
        return inner(1)
    return middle(10)

print(outer(1))

def compose(f, g):
    def h(x):
        return f(g(x))
    return h

inc = lambda x: x + 1
dbl = lambda x: x * 2
inc_then_dbl = compose(dbl, inc)
print(inc_then_dbl(5), compose(inc, dbl)(5))

def make_greeting(greeting):
    def greet(name):
        punct = "!"
        return f"{greeting}, {name}{punct}"
    return greet

hello = make_greeting("Hello")
print(hello("Ana"))
print(hello.__name__, hello.__qualname__, inc.__name__)
