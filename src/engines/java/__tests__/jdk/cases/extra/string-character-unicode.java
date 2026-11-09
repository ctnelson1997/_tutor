import java.util.regex.PatternSyntaxException;

// #66: String methods refuse null arguments, Character's tests know every
// letter and digit, an emoji is two chars, and regexes are Java's.
public class Main {
    interface Call { Object run(); }

    static void attempt(String what, Call call) {
        try {
            System.out.println(what + " = " + call.run());
        } catch (NullPointerException e) {
            System.out.println(what + ": NPE " + e.getMessage());
        } catch (RuntimeException e) {
            System.out.println(what + ": " + e.getClass().getSimpleName() + " " + e.getMessage());
        }
    }

    public static void main(String[] args) {
        String n = null;
        attempt("concat", () -> "abc".concat(n));
        attempt("contains", () -> "abc".contains(n));
        attempt("compareTo", () -> "abc".compareTo(n));
        attempt("startsWith", () -> "abc".startsWith(n));
        attempt("indexOf", () -> "abc".indexOf(n));
        attempt("replace", () -> "abc".replace("a", n));
        attempt("split", () -> "abc".split(n));
        attempt("equals", () -> "abc".equals(n));
        attempt("join", () -> String.join(",", "a", n));

        String text = "Café crème brûlée, naïve résumé!";
        int letters = 0, upper = 0;
        for (char c : text.toCharArray()) {
            if (Character.isLetter(c)) letters++;
            if (Character.isUpperCase(c)) upper++;
        }
        System.out.println("letters " + letters + ", upper " + upper);
        for (char c : new char[] { 'é', 'ß', 'Ω', '中', '٣', '7', '_', '\t', ' ', ' ', '\u001c' }) {
            System.out.println((int) c + ": letter=" + Character.isLetter(c) + " digit=" + Character.isDigit(c)
                + " alpha=" + Character.isAlphabetic(c) + " letterOrDigit=" + Character.isLetterOrDigit(c)
                + " whitespace=" + Character.isWhitespace(c) + " space=" + Character.isSpaceChar(c)
                + " upper=" + (int) Character.toUpperCase(c) + " lower=" + (int) Character.toLowerCase(c)
                + " value=" + Character.getNumericValue(c));
        }

        String smile = "a😀bc";
        System.out.println(smile.length() + " " + smile.toCharArray().length + " " + smile.chars().count() + " " + smile.codePoints().count());
        System.out.println((int) smile.toCharArray()[4] + " " + smile.chars().sum() + " " + smile.codePoints().sum());
        System.out.println(String.valueOf(new char[] { 'a', 'b', 'c', 'd', 'e' }, 1, 3) + " " + String.copyValueOf(new char[] { 'x', 'y', 'z' }, 2, 1));
        attempt("valueOf range", () -> String.valueOf(new char[] { 'a', 'b' }, 1, 3));
        System.out.println("[" + " x ".strip() + "] [" + " x ".strip() + "] [" + " x ".trim() + "] " + " ".isBlank() + " " + " ".isBlank());

        try {
            "12+30".split("+");
        } catch (PatternSyntaxException e) {
            System.out.println("caught " + e.getDescription() + " at " + e.getIndex() + " in " + e.getPattern());
            System.out.println(e.getMessage());
        }
        try {
            "x".matches("[b-a]");
        } catch (IllegalArgumentException e) {
            System.out.println(e.getMessage());
        }
        System.out.println(String.join("|", "a\r\nb\nc\rd".split("\\R")) + " " + "x".matches("[a-d[m-z]]") + " " + "ab\ncd".matches("(?m)ab")
            + " " + "a b c".replaceAll("\\s", "_").replace(' ', '~') + " " + "(?:ab)+".length() + " " + "ababab".matches("(?:ab)+"));
    }
}
