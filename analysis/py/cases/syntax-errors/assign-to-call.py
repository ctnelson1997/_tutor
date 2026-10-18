# Syntax error: invalid assignment target, assigning to a function call
def get_score():
    return 0

print(get_score())
get_score() = 100
print(get_score())
