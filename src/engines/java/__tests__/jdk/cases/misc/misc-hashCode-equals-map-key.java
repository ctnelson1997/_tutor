import java.util.*;
public class Main {
  static class Key {
    int id;
    Key(int id) { this.id = id; }
    public boolean equals(Object o) { return o instanceof Key && ((Key) o).id == id; }
    public int hashCode() { return Integer.hashCode(id); }
  }
  public static void main(String[] args) {
    Map<Key, String> m = new HashMap<>();
    m.put(new Key(1), "one");
    System.out.println(m.get(new Key(1)));
  }
}
