# nonlocal rebinds an enclosing function's variable; two counters from one factory are independent; mutation needs no nonlocal
def make_counter(start=0):
    count = start
    def step(by=1):
        nonlocal count
        count += by
        return count
    return step

c1 = make_counter()
c2 = make_counter(10)
print(c1(), c1(), c1(5))
print(c2(), c1())

def outer():
    x = "outer"
    def inner():
        nonlocal x
        x = "changed by inner"
    inner()
    return x

print(outer())

def accumulate():
    items = []
    def add(v):
        items.append(v)
        return items
    return add

add = accumulate()
add(1)
print(add(2))
