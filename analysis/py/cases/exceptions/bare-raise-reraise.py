# Bare raise re-raises the current exception after logging; the outer handler sees the original
log = []

def load(name):
    if not name.endswith(".txt"):
        raise ValueError(f"not a text file: {name}")
    return name.upper()

def load_logged(name):
    try:
        return load(name)
    except ValueError as e:
        log.append(str(e))
        raise

results = []
for name in ["a.txt", "b.csv", "c.txt"]:
    try:
        results.append(load_logged(name))
    except ValueError as e:
        results.append("skipped " + name)
        print("outer caught:", e, "| same args:", e.args)
print(results)
print(log)
try:
    try:
        {}["k"]
    except KeyError:
        print("handling, then re-raise")
        raise
except KeyError as e:
    print("re-raised KeyError:", e)
