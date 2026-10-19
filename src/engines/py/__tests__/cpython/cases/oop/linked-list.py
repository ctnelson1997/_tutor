# A singly linked list built from Node objects: append, traverse, insert at front, reverse
class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next

class LinkedList:
    def __init__(self):
        self.head = None
        self.size = 0

    def append(self, value):
        node = Node(value)
        if self.head is None:
            self.head = node
        else:
            cur = self.head
            while cur.next is not None:
                cur = cur.next
            cur.next = node
        self.size += 1

    def push_front(self, value):
        self.head = Node(value, self.head)
        self.size += 1

    def reverse(self):
        prev = None
        cur = self.head
        while cur:
            cur.next, prev, cur = prev, cur, cur.next
        self.head = prev

    def __str__(self):
        parts = []
        cur = self.head
        while cur:
            parts.append(str(cur.value))
            cur = cur.next
        return " -> ".join(parts) or "empty"

lst = LinkedList()
print(lst)
for v in [3, 5, 8]:
    lst.append(v)
lst.push_front(1)
print(lst, lst.size)
lst.reverse()
print(lst)
