// instanceof, isPrototypeOf, getPrototypeOf chains, Symbol.hasInstance, setPrototypeOf and null-prototype objects
class Vehicle {}
class Car extends Vehicle {}
class Truck extends Vehicle {}
const car = new Car();
const plain = {};
const nullProto = Object.create(null);

console.log(car instanceof Car, car instanceof Vehicle, car instanceof Truck, car instanceof Object);
console.log(plain instanceof Object, nullProto instanceof Object);
console.log([] instanceof Array, [] instanceof Object, (() => 1) instanceof Function);
console.log('str' instanceof String, new String('str') instanceof String, typeof new String('s'));
console.log(Vehicle.prototype.isPrototypeOf(car), Object.getPrototypeOf(car) === Car.prototype);
console.log(car.constructor.name, Object.getPrototypeOf(Car.prototype).constructor.name);

function chain(obj) {
  const names = [];
  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    names.push(proto.constructor.name);
    proto = Object.getPrototypeOf(proto);
  }
  return names;
}
console.log(chain(car), chain([]), chain(nullProto));

class Even {
  static [Symbol.hasInstance](n) {
    return n % 2 === 0;
  }
}
console.log(4 instanceof Even, 7 instanceof Even);

Object.setPrototypeOf(car, Truck.prototype);
console.log(car instanceof Truck, car instanceof Car, car.constructor.name);
nullProto.x = 1;
console.log(nullProto, 'toString' in nullProto, 'toString' in plain);
