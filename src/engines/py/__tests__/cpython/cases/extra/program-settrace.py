# A program that traces itself: its trace function gets the events CPython
# gives it, and sys.settrace(None) ends only its own tracing (#78).
import sys

events = []


def tracer(frame, event, arg):
    if frame.f_code.co_name == "square":
        events.append((event, frame.f_lineno))
        return tracer
    return None


def square(n):
    result = n * n
    return result


print(sys.gettrace())
sys.settrace(tracer)
print(sys.gettrace() is tracer)
square(4)
sys.settrace(None)
print(events)
x = square(5)
print(x)
