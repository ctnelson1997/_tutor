# An exception raised three calls deep unwinds every frame and is caught at the top level
def level3(items, i):
    print("  level3 start")
    value = items[i]
    print("  level3 never reached when out of range")
    return value

def level2(items, i):
    print(" level2 start")
    result = level3(items, i) * 2
    print(" level2 end")
    return result

def level1(items, i):
    print("level1 start")
    try:
        return level2(items, i)
    finally:
        print("level1 finally")

data = [10, 20, 30]
print(level1(data, 1))
try:
    level1(data, 5)
except IndexError as e:
    print("caught at top:", e)
answer = level1(data, -1)
print(answer)
