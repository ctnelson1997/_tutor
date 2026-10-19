# a class with class attributes and methods: the class object should show them
class Counter:
    instances = 0
    step = 2

    def __init__(self):
        Counter.instances += 1
        self.value = 0

    def bump(self):
        self.value += Counter.step
        return self.value

a = Counter()
b = Counter()
a.bump()
print(Counter.instances, a.value, b.value)
