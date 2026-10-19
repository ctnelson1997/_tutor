# Handling bad input inside a loop: continue past errors and count what failed
raw = ["12", "7.5", "abc", "", "42", None, "-3", "1e3"]
good = []
errors = {}
for item in raw:
    try:
        n = int(item)
    except ValueError as e:
        errors[repr(item)] = str(e)
        continue
    except TypeError as e:
        errors[repr(item)] = str(e)
        continue
    if n < 0:
        print("negative, stopping at", n)
        break
    good.append(n)
print(good)
for k, v in errors.items():
    print(k, "->", v)
print(len(errors))
