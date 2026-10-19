# __getattr__ runs only for missing attributes; it prints, so any extra call would show in stdout
class Config:
    def __init__(self, **values):
        self.values = values
        self.lookups = 0

    def __getattr__(self, name):
        print(f"  __getattr__({name!r})")
        self.lookups += 1
        if name in self.values:
            return self.values[name]
        raise AttributeError(f"no setting {name!r}")

cfg = Config(debug=True, level=3)
print("made config")
print(cfg.debug)
print(cfg.level)
print(cfg.lookups)       # a real attribute: no __getattr__ call
print(hasattr(cfg, "color"))
print(getattr(cfg, "color", "default"))
cfg.color = "blue"
print(cfg.color)         # now a real attribute
print(cfg.lookups)
