// db_connection.js
const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('./movies.db');

module.exports = db;
