// 'use strict' in a function body (#89): only that function is strict
function sloppy() {
  return typeof this;
}
function strict() {
  'use strict';
  return typeof this;
}
function linked(a) {
  a = 2;
  return arguments[0];
}
function unlinked(a) {
  'use strict';
  a = 2;
  return arguments[0];
}
const arrow = () => {
  'use strict';
  return typeof this;
};
console.log(sloppy(), strict(), linked(1), unlinked(1), arrow());
