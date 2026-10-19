# A program that swaps sys.stdout for a StringIO and back: what it printed in between is in the buffer, not on screen
import io
import sys

buffer = io.StringIO()
sys.stdout = buffer
print("into the buffer")
data = {"a": [1, 2]}
print(data)
sys.stdout = sys.__stdout__
print("back on screen")
print(repr(buffer.getvalue()))
sys.stderr = io.StringIO()
print("hidden warning", file=sys.stderr)
captured = sys.stderr.getvalue()
sys.stderr = sys.__stderr__
print("stderr held:", repr(captured))
