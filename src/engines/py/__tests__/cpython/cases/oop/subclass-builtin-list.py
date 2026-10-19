# Subclasses of list and dict: they keep their contents plus their own attributes and methods
class History(list):
    def __init__(self, limit):
        super().__init__()
        self.limit = limit

    def record(self, item):
        self.append(item)
        if len(self) > self.limit:
            self.pop(0)

class Counter(dict):
    def __missing__(self, key):
        return 0

h = History(3)
for cmd in ["ls", "cd", "pwd", "git", "make"]:
    h.record(cmd)
print(h, len(h), h.limit, h[0])
print(isinstance(h, list), type(h).__name__)
c = Counter()
for ch in "banana":
    c[ch] = c[ch] + 1
print(c, c["z"], "z" in c)
print(sorted(c.items()))
merged = h + ["extra"]
print(merged, type(merged).__name__)
