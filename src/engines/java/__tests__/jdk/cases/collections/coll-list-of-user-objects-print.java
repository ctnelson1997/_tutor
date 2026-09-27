import java.util.*;
public class Main {
  static class Item {
    String n; double p;
    Item(String n, double p) { this.n = n; this.p = p; }
    public String toString() { return n + "($" + p + ")"; }
  }
  public static void main(String[] args) {
    ArrayList<Item> cart = new ArrayList<>();
    cart.add(new Item("pen", 1.5));
    cart.add(new Item("book", 12.0));
    System.out.println(cart);
    System.out.println(cart.toString());
    System.out.println(cart.get(1));
  }
}
