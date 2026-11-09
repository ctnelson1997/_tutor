// #64: Throwable's state as the JDK keeps it: constructors with a cause, a
// getMessage() override that toString() uses, a field named like Throwable's
// own, suppressed exceptions and initCause.
public class Main {
    static class Validation extends RuntimeException {
        private final int age;
        Validation(int age) { this.age = age; }
        @Override public String getMessage() { return "age must be positive but was " + age; }
    }

    // The classic bug: the message never reaches super, so getMessage() is null.
    static class BadEx extends Exception {
        private String msg;
        BadEx(String msg) { this.msg = msg; }
        String msg() { return msg; }
    }

    static class OtherEx extends RuntimeException {
        private String message;
        OtherEx(String m) { super(m); message = "own field"; }
        String field() { return message; }
    }

    static class Localized extends Exception {
        Localized(String m) { super(m); }
        @Override public String getLocalizedMessage() { return "localized " + getMessage(); }
    }

    static class Res implements AutoCloseable {
        final String name;
        final boolean fails;
        Res(String name, boolean fails) { this.name = name; this.fails = fails; }
        @Override public void close() {
            System.out.println("close " + name);
            if (fails) throw new IllegalStateException("close " + name);
        }
    }

    static int parse(String s) {
        try {
            return Integer.parseInt(s);
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("bad input: " + s, e);
        }
    }

    public static void main(String[] args) {
        Exception loadFailed = new Exception("load failed", new ArrayIndexOutOfBoundsException("x"));
        System.out.println(loadFailed.getCause());
        RuntimeException wrapped = new RuntimeException(new IllegalStateException("inner"));
        System.out.println(wrapped.getMessage());
        System.out.println(wrapped.getCause().getMessage());
        System.out.println(wrapped);
        System.out.println(new RuntimeException((Throwable) null).getMessage());

        Validation v = new Validation(-3);
        System.out.println(v);
        System.out.println("caught: " + v);
        System.out.println(v.getLocalizedMessage());
        Localized loc = new Localized("text");
        System.out.println(loc + " / " + loc.getMessage());

        BadEx bad = new BadEx("oops");
        System.out.println(bad.getMessage() + " " + bad.msg() + " " + bad);
        OtherEx other = new OtherEx("detail");
        System.out.println(other.getMessage() + " " + other.field() + " " + other);

        try {
            parse("12x");
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage() + " <- " + e.getCause());
        }

        Exception top = new Exception("top");
        top.addSuppressed(new RuntimeException("first"));
        top.addSuppressed(new Error("second"));
        System.out.println(top.getSuppressed().length + " " + top.getSuppressed()[1]);
        try {
            top.addSuppressed(top);
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage());
        }

        Exception later = new Exception("later");
        System.out.println(later.initCause(new Error("why")).getCause());
        try {
            later.initCause(null);
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage());
        }

        try (Res a = new Res("a", true); Res b = new Res("b", true)) {
            throw new RuntimeException("body");
        } catch (RuntimeException e) {
            System.out.println(e.getMessage() + " suppressed " + e.getSuppressed().length
                + ": " + e.getSuppressed()[0].getMessage() + ", " + e.getSuppressed()[1].getMessage());
        }
        try (Res a = new Res("c", true); Res b = new Res("d", false)) {
            System.out.println("body ok");
        } catch (IllegalStateException e) {
            System.out.println(e.getMessage() + " suppressed " + e.getSuppressed().length);
        }

        System.out.println(parse("7") + parse("seven"));
    }
}
