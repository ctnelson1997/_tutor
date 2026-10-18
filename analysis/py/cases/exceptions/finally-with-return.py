# finally runs on return, and a return in finally overrides the try's return and swallows exceptions
def tidy():
    try:
        print("  in try")
        return "from try"
    finally:
        print("  in finally")

def override():
    try:
        return "try value"
    finally:
        return "finally value"

def swallow():
    try:
        1 / 0
    finally:
        return "swallowed"

def loop_with_finally():
    out = []
    for i in range(4):
        try:
            if i == 1:
                continue
            if i == 3:
                break
            out.append(i)
        finally:
            out.append(f"f{i}")
    return out

print(tidy())
print(override())
print(swallow())
print(loop_with_finally())
