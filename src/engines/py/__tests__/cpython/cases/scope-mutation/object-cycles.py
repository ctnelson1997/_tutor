# objects referencing each other: a partner cycle and a doubly linked list whose nodes point both ways
class Node:
    def __init__(self, name):
        self.name = name
        self.partner = None
        self.prev = None
        self.next = None

a = Node("a")
b = Node("b")
a.partner = b
b.partner = a
print(a.partner.name, a.partner.partner.name, a.partner.partner is a)
nodes = [Node(c) for c in "xyz"]
for left, right in zip(nodes, nodes[1:]):
    left.next = right
    right.prev = left
cur = nodes[0]
while cur is not None:
    before = cur.prev.name if cur.prev else None
    after = cur.next.name if cur.next else None
    print(cur.name, before, after)
    cur = cur.next
head = nodes[0]
tail = nodes[-1]
del nodes
print(head.next.next is tail, tail.prev.prev is head)
a.partner = a
print(a.partner is a, b.partner.partner is a)
