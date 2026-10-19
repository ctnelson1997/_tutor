# Uses a Stack class to check whether brackets in expressions are balanced
class Stack:
    def __init__(self):
        self.items = []

    def push(self, item):
        self.items.append(item)

    def pop(self):
        if self.is_empty():
            raise IndexError("pop from empty stack")
        return self.items.pop()

    def peek(self):
        return self.items[-1]

    def is_empty(self):
        return len(self.items) == 0

    def size(self):
        return len(self.items)


PAIRS = {")": "(", "]": "[", "}": "{"}


def is_balanced(expr):
    stack = Stack()
    for ch in expr:
        if ch in "([{":
            stack.push(ch)
        elif ch in PAIRS:
            if stack.is_empty() or stack.pop() != PAIRS[ch]:
                return False
    return stack.is_empty()


tests = ["(a+b)*[c]", "{[()]}", "(]", "((x)", "a{b(c)d}e"]
results = {}
for t in tests:
    results[t] = is_balanced(t)
    print(f"{t:<12} {'balanced' if results[t] else 'NOT balanced'}")

s = Stack()
for word in ["one", "two", "three"]:
    s.push(word)
print("Top:", s.peek(), "Size:", s.size())
popped = [s.pop() for _ in range(s.size())]
print("Popped in order:", popped)
try:
    s.pop()
except IndexError as e:
    print("Caught:", e)
