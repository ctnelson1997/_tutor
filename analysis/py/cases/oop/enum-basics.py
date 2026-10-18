# Enum members: name/value, iteration, comparison by identity, auto(), lookup by value and name
from enum import Enum, auto

class Color(Enum):
    RED = 1
    GREEN = 2
    BLUE = 3

class Status(Enum):
    TODO = auto()
    DOING = auto()
    DONE = auto()

fav = Color.GREEN
print(fav, repr(fav), fav.name, fav.value)
print([c.name for c in Color])
print(Color(3), Color["RED"], fav is Color.GREEN, fav == 2)
tasks = {"write": Status.DONE, "test": Status.DOING, "ship": Status.TODO}
for task, st in tasks.items():
    print(task, st.name, st.value)
done = [t for t, s in tasks.items() if s is Status.DONE]
print(done, len(Status))
try:
    Color(7)
except ValueError as e:
    print("ValueError:", e)
