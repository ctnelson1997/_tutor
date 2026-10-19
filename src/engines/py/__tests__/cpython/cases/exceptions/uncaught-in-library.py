# ends uncaught in library code: the traceback shows the library frames, as python main.py does
import json

good = json.loads("[1, 2]")
print(good)
bad = json.loads("{\"a\": 1,}")
