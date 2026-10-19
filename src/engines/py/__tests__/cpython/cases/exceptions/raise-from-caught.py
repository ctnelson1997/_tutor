# raise ... from ... sets __cause__; raising inside except sets __context__; both caught and inspected
class ConfigError(Exception):
    pass

def parse_port(text):
    try:
        return int(text)
    except ValueError as e:
        raise ConfigError(f"bad port {text!r}") from e

def lookup(settings, key):
    try:
        return settings[key]
    except KeyError:
        raise ConfigError(f"missing {key}")     # implicit chaining

settings = {"port": "80a"}
for action in [lambda: parse_port(settings["port"]), lambda: lookup(settings, "host")]:
    try:
        action()
    except ConfigError as err:
        print("caught:", err)
        print("  cause:", repr(err.__cause__))
        print("  context:", repr(err.__context__))
        print("  suppress_context:", err.__suppress_context__)
try:
    raise ConfigError("quiet") from None
except ConfigError as err:
    print(err, err.__cause__, err.__suppress_context__)
