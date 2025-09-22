require('dotenv').config();
const { query } = require('./db');

const username = process.argv[2];
if (!username) {
  console.error('Usage: node promote-admin.js <username>');
  process.exit(1);
}

(async () => {
  try {
    const upd = await query('UPDATE users SET is_admin=TRUE WHERE username=$1 RETURNING id, username, is_admin', [username]);
    if (!upd.rows.length) {
      console.log('No such user.');
    } else {
      console.log('Promoted:', upd.rows[0]);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    process.exit(0);
  }
})();