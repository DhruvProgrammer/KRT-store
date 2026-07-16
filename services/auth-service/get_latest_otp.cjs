const Database = require('better-sqlite3');
const db = new Database('auth.db');
const otp = db.prepare('SELECT * FROM otps ORDER BY id DESC LIMIT 1').get();
console.log('Latest OTP:', JSON.stringify(otp, null, 2));