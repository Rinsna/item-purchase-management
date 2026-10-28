const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createPool } = require("mysql2/promise");

const pool = createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  dateStrings: true,
});

module.exports = pool;
