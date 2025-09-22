// Usage: node promote-admin.js <username>
require('dotenv').config();
const { query } = require('./db');

(async () => {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node promote-admin.js <username>');
    process.exit(1);
  }
  try {
    const upd = await query('UPDATE users SET is_admin=TRUE WHERE username=$1 RETURNING id, username, is_admin', [username]);
    if (!upd.rows.length) {
      console.log('No such user.');
    } else {
      console.log('Promoted user to admin:', upd.rows[0]);
    }
  } catch (e) {
    console.error('Error promoting user:', e.message);
  } finally {
    process.exit(0);
  }
})();
