const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const { createPool } = require("mysql2/promise");

function cleanVal(val, keyName) {
  if (!val) return val;
  let s = String(val).trim();
  if (keyName && s.toLowerCase().startsWith(keyName.toLowerCase())) {
    s = s.slice(keyName.length);
  }
  return s.replace(/^[:=\t ]+/, "").trim();
}

const host = cleanVal(process.env.DB_HOST, "DB_HOST");
const user = cleanVal(process.env.DB_USER, "DB_USER");
const password = cleanVal(process.env.DB_PASSWORD, "DB_PASSWORD");
const database = cleanVal(process.env.DB_NAME, "DB_NAME");
const rawPort = cleanVal(process.env.DB_PORT, "DB_PORT");
const rawSsl = cleanVal(process.env.DB_SSL, "DB_SSL");

const isRemoteDb =
  Boolean(host) &&
  host !== "localhost" &&
  host !== "127.0.0.1";

const pool = createPool({
  host: host,
  user: user,
  password: password,
  database: database,
  port: Number(rawPort) || 3306,
  ssl: rawSsl === "true" || isRemoteDb ? { rejectUnauthorized: false } : undefined,
  dateStrings: true,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;
