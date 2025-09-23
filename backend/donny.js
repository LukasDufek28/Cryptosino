require('dotenv').config();
const { query } = require('./db');

// Usage: node donny.js <username>
// Assigns the special immutable OWNER role to the given username.
// Guarantees only one owner exists. If another owner exists and it's a different
// username, script will refuse to proceed unless FORCE=1 env var is provided.
// Owner implicitly has admin powers and cannot be demoted or deleted.

const username = process.argv[2];
if (!username) {
  console.error('Usage: node donny.js <username>');
  process.exit(1);
}

(async () => {
  try {
    // Ensure user exists
    const userRes = await query('SELECT id, username, is_admin, is_owner FROM users WHERE username=$1', [username]);
    if (!userRes.rows.length) {
      console.error('User does not exist:', username);
      process.exit(1);
    }
    // Check existing owners
    const owners = await query('SELECT id, username FROM users WHERE is_owner=TRUE');
    if (owners.rows.length > 0) {
      // If the existing owner is the same user, just ensure admin flag and exit
      if (owners.rows[0].username === username) {
        const ensure = await query('UPDATE users SET is_admin=TRUE WHERE username=$1 RETURNING id, username, is_admin, is_owner', [username]);
        console.log('User already owner. Ensured admin flag:', ensure.rows[0]);
        process.exit(0);
      }
      if (process.env.FORCE === '1') {
        console.log('FORCE=1 provided. Revoking ownership from', owners.rows[0].username);
        await query('UPDATE users SET is_owner=FALSE WHERE id=$1', [owners.rows[0].id]);
      } else {
        console.error('An owner already exists:', owners.rows[0].username, '\nSet FORCE=1 to transfer ownership.');
        process.exit(1);
      }
    }
    const updated = await query('UPDATE users SET is_owner=TRUE, is_admin=TRUE WHERE username=$1 RETURNING id, username, is_admin, is_owner', [username]);
    console.log('Owner assigned:', updated.rows[0]);
    console.log('NOTE: This user cannot be demoted or deleted through normal admin endpoints.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    process.exit(0);
  }
})();