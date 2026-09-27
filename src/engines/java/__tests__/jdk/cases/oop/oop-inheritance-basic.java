public class Main {
  static class Animal {
    String name;
    Animal(String name) { this.name = name; }
    String speak() { return "..."; }
    String describe() { return name + " says " + speak(); }
  }
  static class Dog extends Animal {
    Dog(String name) { super(name); }
    String speak() { return "Woof"; }
  }
  static class Cat extends Animal {
    Cat(String name) { super(name); }
    String speak() { return "Meow"; }
  }
  public static void main(String[] args) {
    Animal[] pets = { new Dog("Rex"), new Cat("Tom"), new Animal("Generic") };
    for (Animal a : pets) {
      System.out.println(a.describe());
    }
  }
}
