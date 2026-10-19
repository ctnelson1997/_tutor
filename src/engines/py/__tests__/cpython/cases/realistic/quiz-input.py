# Runs a short quiz from a list of (question, answer) tuples and grades the typed answers
QUESTIONS = [
    ("What is the capital of France?", "paris"),
    ("How many sides does a hexagon have?", "6"),
    ("What keyword defines a function in Python?", "def"),
    ("What is 7 * 8?", "56"),
    ("Which planet is known as the Red Planet?", "mars"),
]


def normalize(answer):
    return answer.strip().lower()


name = input("Your name: ").strip()
score = 0
missed = []
for number, (question, correct) in enumerate(QUESTIONS, start=1):
    answer = normalize(input(f"Q{number}. {question} "))
    if answer == correct:
        score += 1
        print("  Correct!")
    else:
        missed.append((number, answer, correct))
        print(f"  Sorry, the answer is {correct}.")

percent = score / len(QUESTIONS) * 100
print()
print(f"{name}, you scored {score}/{len(QUESTIONS)} ({percent:.0f}%)")
for number, given, correct in missed:
    print(f"  Q{number}: you said {given!r}, expected {correct!r}")
passed = percent >= 60
print("Passed!" if passed else "Try again.")
