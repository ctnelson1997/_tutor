# Objects die where the program releases them, as in python main.py (#78):
# the tracer holds none of them.
import gc
import sys
import weakref


class Resource:
    def __init__(self, name):
        self.name = name

    def __del__(self):
        print("released", self.name)


r = Resource("a")
r = None; print("after a")

items = [Resource("b")]
items.clear()
print("after b")

nums = [1, 2]
print(sys.getrefcount(nums))
alias = nums
print(sys.getrefcount(nums))
pair = [nums, nums]
print(sys.getrefcount(nums))
del pair
print(sys.getrefcount(nums))

t = Resource("t")
ref = weakref.ref(t)
del t
print(ref())


def numbers():
    try:
        yield 1
        yield 2
    finally:
        print("generator closed")


g = numbers()
print(next(g))
g = None
print("after the generator")


class Node:
    def __init__(self, name):
        self.name = name
        self.other = None

    def __del__(self):
        print("collected", self.name)


n1 = Node("n1")
n2 = Node("n2")
n1.other = n2
n2.other = n1
del n1, n2
gc.collect()
print("done")
