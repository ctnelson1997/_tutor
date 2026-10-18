# datetime with fixed dates only: date arithmetic, timedelta, weekday, strftime, strptime, comparisons
from datetime import date, datetime, timedelta

start = date(2024, 2, 27)
print(start, repr(start))
for i in range(4):
    d = start + timedelta(days=i)
    print(d, d.strftime("%a %b %d"), d.weekday())
deadline = date(2024, 12, 25)
left = deadline - start
print(left, left.days, type(left).__name__)
print(date(2023, 3, 1) - date(2023, 2, 1), date(2024, 3, 1) - date(2024, 2, 1))
meeting = datetime(2024, 7, 4, 14, 30)
later = meeting + timedelta(hours=10, minutes=45)
print(meeting, later, later.date(), later.hour)
print(meeting.strftime("%Y-%m-%d %H:%M"), meeting.isoformat())
parsed = datetime.strptime("2001-09-09 01:46:40", "%Y-%m-%d %H:%M:%S")
print(parsed, parsed.year, parsed > meeting)
print(date(2000, 1, 1).isoweekday(), date.fromisoformat("2030-06-15"))
print(timedelta(days=1, seconds=90), timedelta(weeks=2).total_seconds())
