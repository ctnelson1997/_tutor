public class Main {
  static class Bag {
    int[] items;
    { items = new int[]{1, 2, 3}; }
  }
  public static void main(String[] args) {
    System.out.println(new Bag().items.length);
  }
}
