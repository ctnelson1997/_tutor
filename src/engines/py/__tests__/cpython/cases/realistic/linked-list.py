# Builds a singly linked list with Node objects: append, prepend, find, remove and reverse
class Node:
    def __init__(self, data, next=None):
        self.data = data
        self.next = next


class LinkedList:
    def __init__(self):
        self.head = None
        self.size = 0

    def append(self, data):
        node = Node(data)
        if self.head is None:
            self.head = node
        else:
            cur = self.head
            while cur.next is not None:
                cur = cur.next
            cur.next = node
        self.size += 1

    def prepend(self, data):
        self.head = Node(data, self.head)
        self.size += 1

    def find(self, data):
        index = 0
        cur = self.head
        while cur:
            if cur.data == data:
                return index
            cur = cur.next
            index += 1
        return -1

    def remove(self, data):
        prev, cur = None, self.head
        while cur and cur.data != data:
            prev, cur = cur, cur.next
        if cur is None:
            return False
        if prev is None:
            self.head = cur.next
        else:
            prev.next = cur.next
        self.size -= 1
        return True

    def reverse(self):
        prev = None
        cur = self.head
        while cur:
            nxt = cur.next
            cur.next = prev
            prev = cur
            cur = nxt
        self.head = prev

    def __str__(self):
        parts = []
        cur = self.head
        while cur:
            parts.append(str(cur.data))
            cur = cur.next
        return " -> ".join(parts) + " -> None"


lst = LinkedList()
for value in [10, 20, 30]:
    lst.append(value)
lst.prepend(5)
print(lst, "size", lst.size)
print("find(30):", lst.find(30), "find(99):", lst.find(99))
print("remove(20):", lst.remove(20), "remove(42):", lst.remove(42))
print(lst)
lst.reverse()
print("Reversed:", lst)
second = lst.head.next
print("Second node holds", second.data)
