# ends uncaught: reads numbers until input() runs out of stdin (EOFError); the last prompt shows before the traceback
total = 0
count = 0
while True:
    text = input(f"Number {count + 1}: ")
    total += int(text)
    count += 1
    print("running total:", total)
