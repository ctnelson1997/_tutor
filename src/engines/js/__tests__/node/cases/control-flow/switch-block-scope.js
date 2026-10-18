// switch cases with their own block scopes (same const name twice), returns, and a state machine
function area(shape) {
  switch (shape.kind) {
    case "circle": {
      const r = shape.r;
      return Math.round(Math.PI * r * r * 100) / 100;
    }
    case "rect": {
      const { w, h } = shape;
      return w * h;
    }
    case "square": {
      const r = shape.side;
      return r * r;
    }
    default:
      throw new Error("unknown shape " + shape.kind);
  }
}
const shapes = [{ kind: "circle", r: 2 }, { kind: "rect", w: 3, h: 4 }, { kind: "square", side: 5 }];
const areas = shapes.map(area);
console.log(areas);
try {
  area({ kind: "hexagon" });
} catch (e) {
  console.log(e.message);
}
let state = "idle";
for (const ev of ["start", "pause", "start", "stop"]) {
  switch (state + ":" + ev) {
    case "idle:start": state = "running"; break;
    case "running:pause": state = "paused"; break;
    case "paused:start": state = "running"; break;
    case "running:stop": state = "done"; break;
  }
  console.log(ev, "->", state);
}
