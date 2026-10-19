# Exception objects as values: args, str vs repr (KeyError quotes its key), exceptions kept in a list
caught = []
for action in ["key", "multi", "empty", "value"]:
    try:
        if action == "key":
            raise KeyError("color")
        if action == "multi":
            raise ValueError("bad", 42, [1, 2])
        if action == "empty":
            raise RuntimeError
        raise ValueError("only one")
    except Exception as e:
        caught.append(e)

for e in caught:
    print(type(e).__name__, "| str:", str(e), "| repr:", repr(e), "| args:", e.args)
first = caught[0]
print(first.args[0], len(caught))
err = ValueError("made, not raised")
print(err, isinstance(err, Exception), err.__traceback__ is None)
print(caught[1].__traceback__ is not None)
