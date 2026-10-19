# ends uncaught: an exception chained with raise ... from e, so the traceback shows both exceptions
class DataError(Exception):
    pass

def read_age(record):
    try:
        return int(record["age"])
    except (KeyError, ValueError) as e:
        raise DataError(f"bad record for {record.get('name', '?')}") from e

people = [{"name": "Ann", "age": "31"}, {"name": "Bo", "age": "thirty"}]
ages = []
for p in people:
    ages.append(read_age(p))
    print(p["name"], ages[-1])
print("never printed")
