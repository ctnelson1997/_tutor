# PyTutor's comprehension frames are invisible to the program (#85): in the
# tracebacks it prints, in sys._getframe, in an unbound variable's error.
import logging
import sys
import traceback


def reciprocals(data):
    try:
        return [1 / x for x in data]
    except ZeroDivisionError:
        traceback.print_exc()
        print(traceback.format_exc().splitlines()[-1])
        logging.exception("reciprocals failed")
    return [sys._getframe(0).f_code.co_name for _ in range(1)]


print(reciprocals([1, 0]))
print(len(traceback.extract_stack()))
try:
    sys._getframe(1)
except ValueError as e:
    print("ValueError:", e)


def late():
    r = [y for _ in range(2)]
    y = 1
    return r


try:
    late()
except UnboundLocalError as e:
    print("UnboundLocalError:", e)


class Stack[T]:
    def __init__(self):
        self.items: list[T] = []


class Animal:
    def __init__(self, name):
        self.name = name


class Dog(Animal):
    def __init__(self, name):
        super().__init__(name)


print(Dog("rex").name, len(Stack().items))
