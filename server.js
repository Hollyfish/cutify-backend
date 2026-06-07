require('dotenv').config();
const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");
const amqp = require("amqplib");
const Redis = require("ioredis");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MySQL
const db = mysql.createPool({
  host: process.env.MYSQLHOST || "127.0.0.1",
  port: process.env.MYSQLPORT || 3306,
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "password123",
  database: process.env.MYSQLDATABASE || "cutify_db",
  waitForConnections: true,
  connectionLimit: 10,
});

// Redis
const redis = new Redis({
  host: process.env.REDISHOST || "127.0.0.1",
  port: process.env.REDISPORT || 6379,
});

redis.on("connect", () => console.log("Redis bağlantısı başarılı"));
redis.on("error", (err) => console.error("Redis hatası:", err));

// RabbitMQ
let rabbitChannel = null;

async function connectRabbitMQ() {
  try {
    const conn = await amqp.connect(process.env.RABBITMQ_URL || "amqp://127.0.0.1");
    rabbitChannel = await conn.createChannel();
    await rabbitChannel.assertQueue("appointments", { durable: true });
    console.log("RabbitMQ bağlantısı başarılı");
  } catch (err) {
    console.error("RabbitMQ hatası:", err.message);
  }
}

async function publishToQueue(data) {
  if (!rabbitChannel) return;
  rabbitChannel.sendToQueue(
    "appointments",
    Buffer.from(JSON.stringify(data)),
    { persistent: true }
  );
}

// Tabloları oluştur
async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      firstName VARCHAR(50),
      lastName VARCHAR(50),
      email VARCHAR(100) UNIQUE,
      phone VARCHAR(20),
      password VARCHAR(100),
      role VARCHAR(20) DEFAULT 'user'
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS barbers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      location VARCHAR(100),
      phone VARCHAR(20)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS services (
      id INT AUTO_INCREMENT PRIMARY KEY,
      barberId INT,
      name VARCHAR(100),
      price INT,
      FOREIGN KEY (barberId) REFERENCES barbers(id) ON DELETE CASCADE
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT,
      barberId INT,
      serviceId INT,
      date VARCHAR(20),
      time VARCHAR(10),
      status VARCHAR(20) DEFAULT 'Aktif'
    )
  `);

  // Seed: berber yoksa ekle
  const [barbers] = await db.query("SELECT * FROM barbers");
  if (barbers.length === 0) {
    const [b1] = await db.query(
      "INSERT INTO barbers (name, location, phone) VALUES (?, ?, ?)",
      ["Ahmet Usta", "Isparta Merkez", "05551234567"]
    );
    const [b2] = await db.query(
      "INSERT INTO barbers (name, location, phone) VALUES (?, ?, ?)",
      ["Mehmet Berber", "Isparta Çarşı", "05559876543"]
    );
    await db.query(
      "INSERT INTO services (barberId, name, price) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)",
      [b1.insertId, "Saç Kesimi", 100, b1.insertId, "Sakal Düzeltme", 75, b1.insertId, "Saç + Sakal", 150]
    );
    await db.query(
      "INSERT INTO services (barberId, name, price) VALUES (?, ?, ?), (?, ?, ?)",
      [b2.insertId, "Saç Kesimi", 80, b2.insertId, "Çocuk Kesimi", 60]
    );
    console.log("Seed verisi eklendi!");
  }

  // Seed: admin yoksa ekle
  const [admins] = await db.query("SELECT * FROM users WHERE role = 'admin'");
  if (admins.length === 0) {
    await db.query(
      "INSERT INTO users (firstName, lastName, email, phone, password, role) VALUES (?, ?, ?, ?, ?, 'admin')",
      ["Admin", "User", "admin@cutify.com", "05550000000", "admin123"]
    );
    console.log("Admin kullanıcı eklendi!");
  }

  console.log("Veritabanı yapısı hazır!");
}

function isAdmin(req) {
  return req.headers["x-user-role"] === "admin";
}

// --- ENDPOINTS ---

app.get("/v1", (req, res) => {
  res.send("Cutify API çalışıyor");
});

app.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password]
  );
  if (rows.length === 0)
    return res.status(401).json({ message: "Email veya şifre hatalı" });
  const user = rows[0];
  res.status(200).json({
    message: "Giriş başarılı",
    token: "fake-jwt-token",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
  });
});

app.post("/v1/auth/register", async (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;
  const [existing] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
  if (existing.length > 0)
    return res.status(400).json({ message: "Bu email zaten kayıtlı" });
  const [result] = await db.query(
    "INSERT INTO users (firstName, lastName, email, phone, password, role) VALUES (?, ?, ?, ?, ?, 'user')",
    [firstName, lastName, email, phone, password]
  );
  res.status(201).json({
    message: "Kullanıcı oluşturuldu",
    user: { id: result.insertId, firstName, lastName, email, phone, role: "user" },
  });
});

// Redis cache ile berber listesi
app.get("/v1/barbers", async (req, res) => {
  const cacheKey = "barbers:all";
  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("Redis cache'den döndü");
    return res.status(200).json(JSON.parse(cached));
  }
  const [barbers] = await db.query("SELECT * FROM barbers");
  await redis.set(cacheKey, JSON.stringify(barbers), "EX", 60); // 60 saniye cache
  console.log("MySQL'den çekildi, Redis'e yazıldı");
  res.status(200).json(barbers);
});

app.get("/v1/barbers/:barberId", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  if (rows.length === 0)
    return res.status(404).json({ message: "Berber bulunamadı" });
  res.status(200).json(rows[0]);
});

// RabbitMQ kuyruğuna randevu gönder
app.post("/v1/appointments", async (req, res) => {
  const { userId, barberId, serviceId, date, time } = req.body;
  const [result] = await db.query(
    "INSERT INTO appointments (userId, barberId, serviceId, date, time, status) VALUES (?, ?, ?, ?, ?, 'Aktif')",
    [userId, barberId, serviceId, date, time]
  );
  const appointment = { id: result.insertId, userId, barberId, serviceId, date, time, status: "Aktif" };

  // RabbitMQ kuyruğuna gönder
  await publishToQueue(appointment);
  console.log("Randevu RabbitMQ kuyruğuna eklendi:", appointment);

  res.status(201).json({ message: "Randevu oluşturuldu", appointment });
});

app.put("/v1/appointments/:appointmentId", async (req, res) => {
  const { date, time, serviceId } = req.body;
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0)
    return res.status(404).json({ message: "Randevu bulunamadı" });
  await db.query(
    "UPDATE appointments SET date = COALESCE(?, date), time = COALESCE(?, time), serviceId = COALESCE(?, serviceId) WHERE id = ?",
    [date || null, time || null, serviceId || null, req.params.appointmentId]
  );
  const [updated] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu güncellendi", appointment: updated[0] });
});

app.delete("/v1/appointments/:appointmentId", async (req, res) => {
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0)
    return res.status(404).json({ message: "Randevu bulunamadı" });
  await db.query("DELETE FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu silindi", appointment: existing[0] });
});

app.get("/v1/users/:userId", async (req, res) => {
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.userId]);
  if (users.length === 0)
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  const user = users[0];
  const [appointments] = await db.query("SELECT * FROM appointments WHERE userId = ?", [user.id]);
  res.status(200).json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    },
    appointments,
  });
});

app.put("/v1/users/:userId", async (req, res) => {
  const [existing] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.userId]);
  if (existing.length === 0)
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  const { firstName, lastName, email, phone, password } = req.body;
  await db.query(
    "UPDATE users SET firstName = COALESCE(?, firstName), lastName = COALESCE(?, lastName), email = COALESCE(?, email), phone = COALESCE(?, phone), password = COALESCE(?, password) WHERE id = ?",
    [firstName || null, lastName || null, email || null, phone || null, password || null, req.params.userId]
  );
  const [updated] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.userId]);
  res.status(200).json({ message: "Profil güncellendi", user: updated[0] });
});

app.get("/v1/barbers/:barberId/services", async (req, res) => {
  const [services] = await db.query("SELECT * FROM services WHERE barberId = ?", [req.params.barberId]);
  res.status(200).json(services);
});
app.post("/v1/barbers/:barberId/services", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  const { name, price } = req.body;
  const [result] = await db.query(
    "INSERT INTO services (barberId, name, price) VALUES (?, ?, ?)",
    [req.params.barberId, name, price]
  );
  res.status(201).json({ id: result.insertId, barberId: req.params.barberId, name, price });
});

app.put("/v1/appointments/:appointmentId/status", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  const { status } = req.body;
  await db.query("UPDATE appointments SET status = ? WHERE id = ?", [status, req.params.appointmentId]);
  res.status(200).json({ message: "Durum güncellendi" });
});

app.post("/v1/barbers", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  const { name, location, phone } = req.body;
  const [result] = await db.query(
    "INSERT INTO barbers (name, location, phone) VALUES (?, ?, ?)",
    [name, location, phone]
  );
  // Berber eklenince Redis cache'i temizle
  await redis.del("barbers:all");
  res.status(201).json({ id: result.insertId, name, location, phone });
});

app.delete("/v1/barbers/:barberId", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  await db.query("DELETE FROM barbers WHERE id = ?", [req.params.barberId]);
  // Berber silinince Redis cache'i temizle
  await redis.del("barbers:all");
  res.status(200).json({ message: "Berber silindi" });
});

// Başlat
initDB().then(async () => {
  await connectRabbitMQ();
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda başarıyla çalışıyor`);
  });
}).catch((err) => {
  console.error("Başlatma hatası:", err);
});