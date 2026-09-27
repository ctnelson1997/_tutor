public class Main {
  private static class Node {
    int data;
    Node next;
    Node(int data) {
      this.data = data;
      this.next = null;
    }
  }

  private Node head;
  private int size;

  public void addLast(int value) {
    Node newNode = new Node(value);
    if (head == null) {
      head = newNode;
    } else {
      Node current = head;
      while (current.next != null) {
        current = current.next;
      }
      current.next = newNode;
    }
    size++;
  }

  public void addFirst(int value) {
    Node newNode = new Node(value);
    newNode.next = head;
    head = newNode;
    size++;
  }

  public boolean remove(int value) {
    if (head == null) return false;
    if (head.data == value) {
      head = head.next;
      size--;
      return true;
    }
    Node current = head;
    while (current.next != null) {
      if (current.next.data == value) {
        current.next = current.next.next;
        size--;
        return true;
      }
      current = current.next;
    }
    return false;
  }

  public String toString() {
    StringBuilder sb = new StringBuilder("[");
    Node current = head;
    while (current != null) {
      sb.append(current.data);
      if (current.next != null) sb.append(", ");
      current = current.next;
    }
    return sb.append("]").toString();
  }

  public static void main(String[] args) {
    Main list = new Main();
    list.addLast(10);
    list.addLast(20);
    list.addFirst(5);
    list.addLast(30);
    System.out.println(list + " size=" + list.size);
    list.remove(20);
    System.out.println(list + " size=" + list.size);
  }
}
