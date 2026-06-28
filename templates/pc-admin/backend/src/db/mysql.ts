import { createPool, PoolOptions, Pool } from "mysql2/promise";
import config from "../config";
import Logger from "../loaders/logger";

export const pool: Pool = createPool({
  host: config.mysql.host,
  port: config.mysql.port,
  user: config.mysql.user,
  password: config.mysql.password,
  database: config.mysql.database,
  charset: config.mysql.charset,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
} as PoolOptions);

export async function initSchema(): Promise<void> {
  const createTableSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INT PRIMARY KEY AUTO_INCREMENT,
      username VARCHAR(32) UNIQUE,
      password VARCHAR(32),
      time DATETIME
    )
  `;

  const initAdminSql = `
    INSERT IGNORE INTO users (username, password, time)
    VALUES (?, ?, NOW())
  `;

  const connection = await pool.getConnection();
  try {
    await connection.query(createTableSql);
    Logger.info("users 表初始化成功");

    await connection.query(initAdminSql, [
      "admin",
      "0192023a7bbd73250516f069df18b500",
    ]);
    Logger.info("默认 admin 用户初始化成功");
  } finally {
    connection.release();
  }
}
