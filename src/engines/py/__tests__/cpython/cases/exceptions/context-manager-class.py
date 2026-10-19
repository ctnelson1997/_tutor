# A context manager class: __enter__/__exit__ order, the value bound by as, and suppressing an exception
class Tracker:
    def __init__(self, name, suppress=False):
        self.name = name
        self.suppress = suppress
        self.log = []

    def __enter__(self):
        print(f"enter {self.name}")
        self.log.append("enter")
        return self

    def __exit__(self, exc_type, exc, tb):
        kind = exc_type.__name__ if exc_type else None
        print(f"exit {self.name}: {kind} {exc}")
        self.log.append("exit")
        return self.suppress

with Tracker("plain") as t:
    print("inside", t.name)
print(t.log)

with Tracker("suppressing", suppress=True) as t2:
    print("about to fail")
    int("nope")
    print("not printed")
print("after suppressed block", t2.log)

try:
    with Tracker("propagating"):
        [].pop()
except IndexError as e:
    print("caught outside:", e)
