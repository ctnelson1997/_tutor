# Exceptions that derive from BaseException, not Exception, are the program's own too
class Quit(BaseException):
    pass

def run(n):
    if n == 3:
        raise Quit("stopping at 3")
    return n * 2

try:
    for i in range(5):
        print(run(i))
except Quit as e:
    print("caught", type(e).__name__, e)
print("then uncaught")
raise KeyboardInterrupt("pressed Ctrl-C")
