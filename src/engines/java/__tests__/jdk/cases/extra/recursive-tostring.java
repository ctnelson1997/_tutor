import java.util.Objects;

// A toString, hashCode or equals that recurses through the library (#73): as deep as Java goes.
public class Main {
  static class Node {
    int value;
    Node next;

    public String toString() {
      return next == null ? "" + value : value + "," + next;
    }

    public int hashCode() {
      return Objects.hash(value, next);
    }

    public boolean equals(Object o) {
      return o instanceof Node n && n.value == value && Objects.equals(n.next, next);
    }
  }

  static class Nothing {
    public String toString() {
      return null;
    }
  }

  static Node list(int size) {
    Node head = null;
    for (int i = 0; i < size; i++) { Node n = new Node(); n.value = i; n.next = head; head = n; }
    return head;
  }

  public static void main(String[] args) {
    Node head = list(1000);
    String text = head.toString();
    System.out.println(text.length() + " " + text.substring(0, 24) + " ... " + text.substring(text.length() - 6));
    String joined = "list: ";
    joined += list(5);
    System.out.println(joined);
    Node a = list(150), b = list(150);
    System.out.println(a.hashCode() + " " + a.equals(b));
    System.out.println("nothing: " + new Nothing());
    System.out.println(new Nothing());
  }
}
