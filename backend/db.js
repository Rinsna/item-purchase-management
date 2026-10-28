const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createPool } = require("mysql2/promise");

const isRemoteDb =
  Boolean(process.env.DB_HOST) &&
  process.env.DB_HOST !== "localhost" &&
  process.env.DB_HOST !== "127.0.0.1";

const pool = createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT) || 3306,
  ssl: process.env.DB_SSL === "true" || isRemoteDb ? { rejectUnauthorized: false } : undefined,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
