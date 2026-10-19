# A program that replaces builtins runs as in CPython; the tracer keeps its own len, str, isinstance, ...
import builtins

original_len = builtins.len
builtins.len = lambda x: 99
print(len([1, 2]))
words = ["a", "bb", "ccc"]
sizes = [original_len(w) for w in words]
builtins.len = original_len
print(len("abc"), sizes)


def isinstance(obj, cls):  # shadows a builtin name at module level
    return "shadowed"


print(isinstance(1, int))
builtins.str = lambda x: "S"
label = "kept"
builtins.str = type("")
print(label, str(5))
