# A Stack class wrapping a list, used to check balanced brackets
class Stack:
    def __init__(self):
        self._items = []

    def push(self, item):
        self._items.append(item)

    def pop(self):
        if not self._items:
            raise IndexError("pop from empty stack")
        return self._items.pop()

    def peek(self):
        return self._items[-1] if self._items else None

    def is_empty(self):
        return len(self._items) == 0

    def __len__(self):
        return len(self._items)

    def __repr__(self):
        return f"Stack({self._items})"

def balanced(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    st = Stack()
    for ch in text:
        if ch in "([{":
            st.push(ch)
        elif ch in pairs:
            if st.is_empty() or st.pop() != pairs[ch]:
                return False
    return st.is_empty()

for t in ["(a[b]{c})", "(]", "((", "x"]:
    print(t, balanced(t))
s = Stack()
s.push(1); s.push(2)
print(s, s.peek(), len(s))
