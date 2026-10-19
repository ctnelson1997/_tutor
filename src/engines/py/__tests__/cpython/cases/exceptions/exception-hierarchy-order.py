# Which except clause catches: the first match wins, base classes catch subclasses (LookupError, ArithmeticError)
import math

def risky(kind):
    if kind == "key":
        return {}["missing"]
    if kind == "index":
        return [][0]
    if kind == "zero":
        return 1 // 0
    if kind == "overflow":
        return math.exp(1000)
    if kind == "type":
        return "a" + 1
    return "ok"

for kind in ["key", "index", "zero", "overflow", "type", "none"]:
    try:
        print(kind, "->", risky(kind))
    except KeyError as e:
        print(kind, "-> KeyError first:", e)
    except LookupError as e:
        print(kind, "-> LookupError:", type(e).__name__, e)
    except ArithmeticError as e:
        print(kind, "-> ArithmeticError:", type(e).__name__, e)
    except Exception as e:
        print(kind, "-> Exception:", type(e).__name__, e)
print(issubclass(KeyError, LookupError), ZeroDivisionError.__mro__[1].__name__)
