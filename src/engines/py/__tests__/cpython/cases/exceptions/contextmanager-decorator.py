# contextlib.contextmanager: code before yield is __enter__, after it (in finally) is __exit__
from contextlib import contextmanager, suppress

events = []

@contextmanager
def section(title):
    events.append("open " + title)
    print(f"[{title}]")
    try:
        yield title.upper()
    except KeyError as e:
        print("  handled KeyError inside the manager:", e)
    finally:
        events.append("close " + title)
        print(f"[/{title}]")

with section("intro") as heading:
    print("  heading is", heading)

with section("lookup"):
    print("  looking up")
    {}["missing"]
print("continued after lookup")

try:
    with section("broken"):
        raise ValueError("boom")
except ValueError as e:
    print("outside got:", e)

with suppress(ZeroDivisionError):
    print("  dividing")
    x = 1 / 0
print(events)
