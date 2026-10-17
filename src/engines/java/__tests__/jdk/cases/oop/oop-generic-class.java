public class Main {
  static class Box<T> {
    private T item;
    Box(T item) { this.item = item; }
    T get() { return item; }
  }
  public static void main(String[] args) {
    Box<String> b = new Box<>("hi");
    Box<Integer> n = new Box<>(42);
    System.out.println(b.get() + " " + (n.get() + 1));
  }
}
