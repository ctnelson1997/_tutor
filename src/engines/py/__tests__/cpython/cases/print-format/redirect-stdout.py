# contextlib.redirect_stdout to a StringIO and print(file=StringIO) capture output that must not reach stdout
import io
import contextlib
buffer = io.StringIO()
print("visible 1")
with contextlib.redirect_stdout(buffer):
    print("captured A")
    print("captured B", end="!")
print("visible 2")
captured = buffer.getvalue()
print(repr(captured))
other = io.StringIO()
print("into other", 1, 2, sep="-", file=other)
print("visible 3")
text = other.getvalue()
print(repr(text), len(text))
lines = captured.splitlines()
print(lines)
