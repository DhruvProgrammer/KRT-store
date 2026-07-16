const Database = require('better-sqlite3');
const db = new Database('auth.db');
db.exec('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "CUSTOMER"');
console.log('Added role column');