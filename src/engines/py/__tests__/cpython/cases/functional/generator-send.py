# send() into a generator: a running average coroutine, priming with next(), and close()
def averager():
    total = 0
    count = 0
    average = None
    while True:
        value = yield average
        if value is None:
            break
        total += value
        count += 1
        average = total / count
    return average

avg = averager()
print(next(avg))
print(avg.send(10))
print(avg.send(20))
print(avg.send(60))
try:
    avg.send(None)
except StopIteration as e:
    print("final:", e.value)

def echo():
    try:
        while True:
            got = yield
            print("  got", got)
    finally:
        print("  echo closed")

e = echo()
next(e)
e.send("hi")
e.send(42)
e.close()
print("after close")
