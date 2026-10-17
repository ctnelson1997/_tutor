public class Main {
  static class Res implements AutoCloseable {
    String name;
    boolean failOnClose;
    Res(String name, boolean failOnClose) {
      this.name = name;
      this.failOnClose = failOnClose;
      System.out.println("open " + name);
    }
    public void close() {
      System.out.println("close " + name);
      if (failOnClose) throw new IllegalStateException("close failed: " + name);
    }
  }

  static int early() {
    try (Res r = new Res("E", false)) {
      return 7;
    } finally {
      System.out.println("finally in early");
    }
  }

  public static void main(String[] args) {
    // resources close in reverse order, before catch and finally run
    try (Res a = new Res("A", false); Res b = new Res("B", false)) {
      System.out.println("body");
      throw new RuntimeException("boom");
    } catch (RuntimeException e) {
      System.out.println("caught " + e.getMessage());
    } finally {
      System.out.println("finally");
    }

    // an exception from close() propagates when the body finished normally
    try (Res c = new Res("C", true)) {
      System.out.println("body 2");
    } catch (IllegalStateException e) {
      System.out.println("caught " + e.getMessage());
    }

    // the body's exception wins over the one from close()
    try (Res d = new Res("D", true)) {
      throw new IllegalArgumentException("from body");
    } catch (RuntimeException e) {
      System.out.println("caught " + e.getMessage());
    }

    // a null resource isn't closed; an existing variable can be a resource
    try (Res none = null) {
      System.out.println("null resource ok");
    }
    Res existing = new Res("F", false);
    try (existing) {
      System.out.println("using F");
    }

    // returning from the body still closes the resource
    System.out.println("early " + early());

    // a resource that fails to open: the ones before it are closed
    try (Res g = new Res("G", false); Res h = make()) {
      System.out.println("not reached");
    } catch (RuntimeException e) {
      System.out.println("caught " + e.getMessage());
    }
  }

  static Res make() {
    throw new RuntimeException("cannot open H");
  }
}
