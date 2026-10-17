public class Main {
  static class Ticket {
    static int nextId = 1;
    int id;
    Ticket() { id = nextId; nextId++; }
  }
  public static void main(String[] args) {
    Ticket a = new Ticket();
    Ticket b = new Ticket();
    Ticket c = new Ticket();
    System.out.println(a.id + " " + b.id + " " + c.id + " next=" + Ticket.nextId);
  }
}
