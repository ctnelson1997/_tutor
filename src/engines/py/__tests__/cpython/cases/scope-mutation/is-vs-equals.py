# == compares values, `is` compares identity: equal lists, None checks, the empty tuple singleton, an __eq__ that always says True, nan
a = [1, 2]
b = [1, 2]
c = a
print(a == b, a is b, a is c)
x = None
print(x is None, x == None)
empty1 = []
empty2 = []
print(empty1 == empty2, empty1 is empty2)
t = ()
u = tuple()
print(t == u, t is u)

class Always:
    def __eq__(self, other):
        return True

w = Always()
print(w == 5, w == None, w is None, w != 3)
d1 = {"k": [1]}
d2 = {"k": [1]}
print(d1 == d2, d1["k"] is d2["k"])
nan = float("nan")
lst = [nan]
print(nan == nan, nan is nan, lst == [nan], lst == [float("nan")])
print([1, 2] == (1, 2), 1 == 1.0, "1" == 1)
