# sys.exit() with a message ends the program: CPython prints the message to stderr, and nothing after it runs
import sys

def check(values):
    for v in values:
        if v < 0:
            sys.exit(f"Error: negative value {v}")
        print("ok", v)

print("checking")
check([3, 1, -2, 5])
print("never printed")
