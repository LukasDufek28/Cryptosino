require('dotenv').config();
const { query, getClient } = require('./db');

(async () => {
  try {
    console.log('== Database Info ==');
    const version = await query('SELECT version()');
    console.log('Version:', version.rows[0].version);

    console.log('\n== Tables ==');
    const tables = await query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
    if (!tables.rows.length) {
      console.log('No tables in public schema. Run: npm run migrate');
      process.exit(0);
    }
    for (const { table_name } of tables.rows) {
      console.log(`\nTable: ${table_name}`);
      const cols = await query(`SELECT column_name, data_type, is_nullable, column_default
                                FROM information_schema.columns
                                WHERE table_schema='public' AND table_name=$1
                                ORDER BY ordinal_position`, [table_name]);
      cols.rows.forEach(c => {
        console.log(`  - ${c.column_name} :: ${c.data_type} ${c.is_nullable === 'NO' ? 'NOT NULL' : ''} ${c.column_default ? 'DEFAULT ' + c.column_default : ''}`);
      });
      const count = await query(`SELECT COUNT(*)::int AS count FROM ${table_name}`);
      console.log(`  Rows: ${count.rows[0].count}`);
      if (count.rows[0].count > 0) {
        const sample = await query(`SELECT * FROM ${table_name} ORDER BY 1 DESC LIMIT 5`);
        console.log('  Sample rows:');
        sample.rows.forEach(r => console.log('   ', r));
      }
    }
    console.log('\nDone.');
    process.exit(0);
  } catch (e) {
    console.error('Inspection failed:', e.message);
    process.exit(1);
  }
})();
