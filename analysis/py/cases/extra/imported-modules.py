# imported modules: the step should not draw the module internals
import json
import math
data = {"a": [1, 2], "pi": round(math.pi, 2)}
text = json.dumps(data)
back = json.loads(text)
print(text, back == data)
