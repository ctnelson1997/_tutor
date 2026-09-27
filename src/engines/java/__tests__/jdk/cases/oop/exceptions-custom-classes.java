public class Main {
  static class ValidationException extends RuntimeException {
    ValidationException(String msg, Throwable cause) { super(msg, cause); }
  }

  static class NotFoundException extends Exception {
    NotFoundException(String what) { super("missing " + what); }
  }

  static class WrapperException extends RuntimeException {
    WrapperException(Throwable cause) { super(cause); }
  }

  static int parse(String s) {
    try {
      return Integer.parseInt(s);
    } catch (NumberFormatException e) {
      throw new ValidationException("bad number " + s, e);
    }
  }

  static void find(String key) throws NotFoundException {
    if (!key.equals("ok")) throw new NotFoundException(key);
  }

  public static void main(String[] args) {
    try {
      parse("x1");
    } catch (ValidationException e) {
      System.out.println(e.getMessage());
      System.out.println(e.getCause() instanceof NumberFormatException);
    }

    try {
      find("ok");
      find("key");
    } catch (NotFoundException e) {
      System.out.println(e);
    }

    // A RuntimeException catch doesn't catch a checked exception.
    try {
      try {
        find("other");
      } catch (RuntimeException e) {
        System.out.println("wrong handler");
      }
    } catch (Exception e) {
      System.out.println("outer handler: " + e.getMessage());
    }

    RuntimeException wrapped = new WrapperException(new IllegalStateException("inner"));
    System.out.println(wrapped.getMessage());
    System.out.println(wrapped.getCause().getMessage());

    try {
      throw new ValidationException("multi", null);
    } catch (IllegalArgumentException | ValidationException e) {
      System.out.println("multi-catch " + e.getMessage());
    }
  }
}
