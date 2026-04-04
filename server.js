const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MySQL Bağlantısı (Sadece Environment Değişkenlerini Kullanır)
const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  waitForConnections: true,
  connectionLimit: 10,
});

// Tabloları oluştur (Sadece yapı oluşturur, veri eklemez)
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

  console.log("Veritabanı yapısı hazır!");
}

function isAdmin(req) {
  return req.headers["x-user-role"] === "admin";
}

// --- API ENDPOINTS ---

app.get("/v1", (req, res) => {
  res.send("Cutify API çalışıyor");
});

app.post("/v1/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const [rows] = await db.query(
    "SELECT * FROM users WHERE email = ? AND password = ?",
    [email, password]
  );
  if (rows.length === 0) {
    return res.status(401).json({ message: "Email veya şifre hatalı" });
  }
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
  if (existing.length > 0) {
    return res.status(400).json({ message: "Bu email zaten kayıtlı" });
  }
  const [result] = await db.query(
    "INSERT INTO users (firstName, lastName, email, phone, password, role) VALUES (?, ?, ?, ?, ?, 'user')",
    [firstName, lastName, email, phone, password]
  );
  res.status(201).json({
    message: "Kullanıcı oluşturuldu",
    user: { id: result.insertId, firstName, lastName, email, phone, role: "user" },
  });
});

app.get("/v1/barbers", async (req, res) => {
  const [barbers] = await db.query("SELECT * FROM barbers");
  res.status(200).json(barbers);
});

app.get("/v1/barbers/:barberId", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  if (rows.length === 0) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }
  res.status(200).json(rows[0]);
});

app.post("/v1/appointments", async (req, res) => {
  const { userId, barberId, serviceId, date, time } = req.body;
  const [result] = await db.query(
    "INSERT INTO appointments (userId, barberId, serviceId, date, time, status) VALUES (?, ?, ?, ?, ?, 'Aktif')",
    [userId, barberId, serviceId, date, time]
  );
  res.status(201).json({
    message: "Randevu oluşturuldu",
    appointment: { id: result.insertId, userId, barberId, serviceId, date, time, status: "Aktif" },
  });
});

app.put("/v1/appointments/:appointmentId", async (req, res) => {
  const { date, time, serviceId } = req.body;
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }
  await db.query(
    "UPDATE appointments SET date = COALESCE(?, date), time = COALESCE(?, time), serviceId = COALESCE(?, serviceId) WHERE id = ?",
    [date || null, time || null, serviceId || null, req.params.appointmentId]
  );
  const [updated] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu güncellendi", appointment: updated[0] });
});

app.delete("/v1/appointments/:appointmentId", async (req, res) => {
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }
  await db.query("DELETE FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu silindi", appointment: existing[0] });
});

app.get("/v1/users/:userId", async (req, res) => {
  const [users] = await db.query("SELECT * FROM users WHERE id = ?", [req.params.userId]);
  if (users.length === 0) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }
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
  if (existing.length === 0) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }
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

app.put("/v1/appointments/:appointmentId/status", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  const { status } = req.body;
  await db.query("UPDATE appointments SET status = ? WHERE id = ?", [status, req.params.appointmentId]);
  res.status(200).json({ message: "Durum güncellendi" });
});

app.post("/v1/barbers", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  const { name, location, phone } = req.body;
  const [result] = await db.query("INSERT INTO barbers (name, location, phone) VALUES (?, ?, ?)", [name, location, phone]);
  res.status(201).json({ id: result.insertId, name, location, phone });
});

app.delete("/v1/barbers/:barberId", async (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ message: "Admin yetkisi gerekli" });
  await db.query("DELETE FROM barbers WHERE id = ?", [req.params.barberId]);
  res.status(200).json({ message: "Berber silindi" });
});

// Sunucuyu Başlat
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda başarıyla çalışıyor`);
  });
}).catch((err) => {
  console.error("Veritabanı bağlantı hatası:", err);
});