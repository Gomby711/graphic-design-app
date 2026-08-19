// Generates a bcrypt hash for SITE_PASSWORD_HASH. Run once during setup:
//   node server/hash-password.js "your password here"
// Paste the printed hash into site/.env — never commit the plaintext
// password or the hash to source control.
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password) {
  console.error('Usage: node server/hash-password.js "your password"');
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);
console.log("\nAdd this to site/.env:\n");
console.log(`SITE_PASSWORD_HASH=${hash}\n`);
