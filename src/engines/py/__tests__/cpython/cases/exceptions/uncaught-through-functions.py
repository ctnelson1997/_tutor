# ends uncaught: a ValueError raised three user functions deep, traceback through all of them
def parse_score(text):
    score = int(text)
    return score

def average_scores(texts):
    total = 0
    for t in texts:
        total += parse_score(t)
    return total / len(texts)

def report(name, texts):
    avg = average_scores(texts)
    print(f"{name}: {avg:.1f}")
    return avg

report("Ann", ["90", "85", "77"])
report("Bo", ["70", "8O", "95"])
print("never printed")
