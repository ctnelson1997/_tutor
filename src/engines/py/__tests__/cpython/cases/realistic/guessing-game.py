# Number guessing game with a seeded secret number; guesses are read from input
import random

random.seed(2024)
secret = random.randint(1, 50)
MAX_TRIES = 7

guesses = []
won = False
low, high = 1, 50
while len(guesses) < MAX_TRIES:
    text = input(f"Guess a number {low}-{high}: ")
    if not text.isdigit():
        print("Numbers only, please.")
        continue
    guess = int(text)
    guesses.append(guess)
    if guess < secret:
        print("Too low")
        low = max(low, guess + 1)
    elif guess > secret:
        print("Too high")
        high = min(high, guess - 1)
    else:
        won = True
        break

if won:
    print(f"Correct! The number was {secret}. You needed {len(guesses)} guesses.")
else:
    print("Out of tries. The number was", secret)
print("Your guesses:", guesses)
off_by = [abs(g - secret) for g in guesses]
print("Distance from the secret each time:", off_by)
