# collections.deque (appendleft, rotate, maxlen), namedtuple (fields, _replace, unpacking) and OrderedDict
from collections import deque, namedtuple, OrderedDict

q = deque([1, 2, 3])
q.appendleft(0)
q.append(4)
print(q, q.popleft(), q.pop(), q)
q.rotate(1)
print(q)
recent = deque(maxlen=3)
for page in ["home", "about", "shop", "cart", "pay"]:
    recent.append(page)
print(recent, list(recent), recent.maxlen)

Point = namedtuple("Point", ["x", "y"])
p = Point(3, 4)
x, y = p
print(p, p.x, p[1], x + y, p._fields)
q2 = p._replace(y=10)
print(q2, p._asdict(), q2 == (3, 10))
Card = namedtuple("Card", "rank suit")
hand = [Card("A", "S"), Card("10", "H")]
print(hand, sorted(hand, key=lambda c: c.suit))

od = OrderedDict(a=1, b=2, c=3)
od.move_to_end("a")
print(od, list(od), od.popitem(last=False))
