const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MySQL Bağlantısı
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,
  ssl: { rejectUnauthorized: false }
});

// Tabloları oluştur
async function initDB() {
  await db.query(`CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, firstName VARCHAR(50), lastName VARCHAR(50), email VARCHAR(100) UNIQUE, phone VARCHAR(20), password VARCHAR(100), role VARCHAR(20) DEFAULT 'user')`);
  await db.query(`CREATE TABLE IF NOT EXISTS barbers (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100), location VARCHAR(100), phone VARCHAR(20))`);
  await db.query(`CREATE TABLE IF NOT EXISTS services (id INT AUTO_INCREMENT PRIMARY KEY, barberId INT, name VARCHAR(100), price INT, FOREIGN KEY (barberId) REFERENCES barbers(id) ON DELETE CASCADE)`);
  await db.query(`CREATE TABLE IF NOT EXISTS appointments (id INT AUTO_INCREMENT PRIMARY KEY, userId INT, barberId INT, serviceId INT, date VARCHAR(20), time VARCHAR(10), status VARCHAR(20) DEFAULT 'Aktif')`);
  console.log("Veritabanı yapısı hazır!");
}

function isAdmin(req) {
  return req.headers["x-user-role"] === "admin";
}

// --- API YOLLARI ---

app.get("/v1", (req, res) => res.send("Cutify API çalışıyor"));

// Giriş ve Kayıt
app.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query("SELECT * FROM users WHERE email = ? AND password = ?", [email, password]);
  if (rows.length === 0) return res.status(401).json({ message: "Email veya şifre hatalı" });
  res.json({ user: rows[0], token: "fake-jwt-token" });
});

app.post("/v1/auth/register", async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;
  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (existing.length > 0) return res.status(400).json({ message: "Bu email zaten kayıtlı" });
  const [result] = await db.query("INSERT INTO users (firstName, lastName, email, phone, password) VALUES (?, ?, ?, ?, ?)", [firstName, lastName, email, phone, password]);
  res.status(201).json({ id: result.insertId });
});

// Berber İşlemleri
app.get("/v1/barbers", async (req, res) => {
  const [barbers] = await db.query("SELECT * FROM barbers");
  res.json(barbers);
});

app.get("/v1/barbers/:id", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.id]);
  if (rows.length === 0) return res.status(404).json({ message: "Berber bulunamadı" });
  res.json(rows[0]);
});

app.get("/v1/barbers/:id/services", async (req, res) => {
  const [services] = await db.query("SELECT * FROM services WHERE barberId = ?", [req.params.id]);
  res.json(services);
});

// YEŞİL SAATLERİ HESAPLAYAN ÖZEL YOL
app.get("/v1/barbers/:id/availability", async (req, res) => {
  const { id } = req.params;
  const { date } = req.query; // Örn: 2026-04-05
  
  if (!date) return res.status(400).json({ message: "Tarih gerekli" });

  const allSlots = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];
  
  const [booked] = await db.query(
    "SELECT time FROM appointments WHERE barberId = ? AND date = ? AND status != 'İptal'", 
    [id, date]
  );
  
  const bookedTimes = booked.map(b => b.time);
  
  const availability = allSlots.map(slot => ({
    time: slot,
    isAvailable: !bookedTimes.includes(slot)
  }));
  
  res.json(availability);
});

// Randevu İşlemleri
app.post("/v1/appointments", async (req, res) => {
  const { userId, barberId, serviceId, date, time } = req.body;
  const [result] = await db.query(
    "INSERT INTO appointments (userId, barberId, serviceId, date, time) VALUES (?, ?, ?, ?, ?)",
    [userId, barberId, serviceId, date, time]
  );
  res.status(201).json({ id: result.insertId, message: "Randevu oluşturuldu" });
});

app.get("/v1/users/:userId", async (req, res) => {
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.userId]);
  if (users.length === 0) return res.status(404).json({ message: "Kullanıcı yok" });
  const [appointments] = await db.query("SELECT * FROM appointments WHERE userId = ?", [req.params.userId]);
  res.json({ user: users[0], appointments });
});

// Sunucuyu Başlat
initDB().then(() => {
  app.listen(PORT, () => console.log(`Server ${PORT} portunda aktif.`));
});