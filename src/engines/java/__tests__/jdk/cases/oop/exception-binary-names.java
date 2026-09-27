public class Main {
  static class Oops extends Exception {
    Oops(String msg) { super(msg); }
  }

  public static void main(String[] args) throws Exception {
    try {
      throw new Oops("nested");
    } catch (Oops e) {
      System.out.println(e);
      System.out.println("as text: " + e);
    }
    try {
      throw new TopLevelProblem();
    } catch (TopLevelProblem e) {
      System.out.println(e + " / " + e.getMessage());
    }
    throw new Oops("uncaught");
  }
}

class TopLevelProblem extends RuntimeException {
}
