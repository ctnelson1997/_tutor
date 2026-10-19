# The order of try / except / else / finally with and without an exception
def divide(a, b):
    print(f"divide({a}, {b})")
    try:
        result = a / b
    except ZeroDivisionError:
        print("  except: cannot divide by zero")
        result = None
    else:
        print("  else: no exception")
    finally:
        print("  finally: always runs")
    print("  after try")
    return result

r1 = divide(10, 4)
r2 = divide(1, 0)
print(r1, r2)
log = []
for value in ["3", "x", "7"]:
    try:
        n = int(value)
    except ValueError:
        log.append("bad " + value)
    else:
        log.append(n * 2)
    finally:
        log.append("|")
print(log)
