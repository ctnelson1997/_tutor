# global lets a function rebind module names (even create new ones); without it, reads see the global and assignments make a local
count = 0
total = 100

def increment():
    global count
    count += 1

def read_only():
    return total * 2

def make_new_global():
    global created
    created = "made inside"

def shadow():
    total = -1
    return total

increment()
increment()
print(count, read_only(), shadow(), total)
make_new_global()
print(created)

def reset():
    global count, total
    count, total = 0, 0

reset()
print(count, total)
