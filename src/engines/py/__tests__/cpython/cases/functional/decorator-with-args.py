# A decorator factory taking arguments: @repeat(n) and @prefix(text) with state on the wrapper
def repeat(times):
    def decorator(func):
        def wrapper(*args, **kwargs):
            results = []
            for _ in range(times):
                results.append(func(*args, **kwargs))
            return results
        return wrapper
    return decorator

def counted(func):
    def wrapper(*args):
        wrapper.calls += 1
        return func(*args)
    wrapper.calls = 0
    return wrapper

@repeat(3)
def roll(sides=6):
    return sides

@counted
def ping():
    return "pong"

print(roll())
print(roll(sides=20))
for _ in range(4):
    ping()
print(ping(), ping.calls)
