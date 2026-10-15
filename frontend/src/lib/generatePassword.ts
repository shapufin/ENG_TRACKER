const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

/** Random password from the browser CSPRNG (ambiguous 0/O/1/l/I left out),
 * retried until it holds an upper-case letter, a lower-case letter and a digit. */
export const generatePassword = (length = 16): string => {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint32Array(length));
    const candidate = Array.from(bytes, (n) => ALPHABET[n % ALPHABET.length]).join("");
    if (/[A-Z]/.test(candidate) && /[a-z]/.test(candidate) && /\d/.test(candidate)) {
      return candidate;
    }
  }
};
