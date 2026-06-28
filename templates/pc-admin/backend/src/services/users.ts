import { pool } from "../db/mysql";
import { hashPassword } from "../utils/password";
import getFormatDate from "../utils/date";

export interface User {
  id: number;
  username: string;
  password: string;
  time: string;
}

export async function findUserByUsername(username: string): Promise<User | null> {
  const [rows] = await pool.execute(
    "SELECT * FROM users WHERE username = ? LIMIT 1",
    [username]
  );
  return ((rows as User[])[0]) || null;
}

export async function createUser(username: string, password: string): Promise<void> {
  const time = await getFormatDate();
  await pool.execute(
    "INSERT INTO users (username, password, time) VALUES (?, ?, ?)",
    [username, hashPassword(password), time]
  );
}

export async function searchUsers(page: number, size: number): Promise<User[]> {
  const [rows] = await pool.query(
    "SELECT * FROM users LIMIT ? OFFSET ?",
    [size, size * (page - 1)]
  );
  return rows as User[];
}

export async function searchUsersByUsername(username: string): Promise<User[]> {
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE username LIKE ?",
    [`%${username}%`]
  );
  return rows as User[];
}

export async function updateUser(id: number, username: string): Promise<void> {
  await pool.execute(
    "UPDATE users SET username = ? WHERE id = ?",
    [username, id]
  );
}

export async function deleteUser(id: number): Promise<void> {
  await pool.execute(
    "DELETE FROM users WHERE id = ?",
    [id]
  );
}
