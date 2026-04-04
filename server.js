const express = require("express");
const cors = require("cors");
const mysql = require("mysql2/promise");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// MySQL Bağlantısı
const db = mysql.createPool({
  host: process.env.MYSQLHOST || "junction.proxy.rlwy.net",
  port: process.env.MYSQLPORT || 51796,
  user: process.env.MYSQLUSER || "root",
  password: process.env.MYSQLPASSWORD || "eWBdmxtbkVTqasuGqJBsgZIryNclzmMB",
  database: process.env.MYSQLDATABASE || "railway",
  waitForConnections: true,
  connectionLimit: 10,
});

// Tabloları oluştur (ilk çalıştırmada)
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

  // Başlangıç verileri
  const [userRows] = await db.query("SELECT COUNT(*) as count FROM users");
  if (userRows[0].count === 0) {
    await db.query(`
      INSERT INTO users (firstName, lastName, email, phone, password, role) VALUES
      ('Arda', 'Kabay', 'arda@example.com', '+905551112233', '123456', 'user'),
      ('Admin', 'User', 'admin@cutify.com', '+905550000000', '123456', 'admin')
    `);
  }

  const [barberRows] = await db.query("SELECT COUNT(*) as count FROM barbers");
  if (barberRows[0].count === 0) {
    await db.query(`
      INSERT INTO barbers (name, location, phone) VALUES
      ('Berber Ahmet', 'Isparta Merkez', '+905551234567'),
      ('Berber Mehmet', 'Isparta Çünür', '+905559876543')
    `);
    await db.query(`
      INSERT INTO services (barberId, name, price) VALUES
      (1, 'Saç Kesimi', 200),
      (1, 'Sakal Tıraşı', 100),
      (2, 'Saç Kesimi', 180),
      (2, 'Yıkama', 80)
    `);
  }

  console.log("Veritabanı hazır!");
}

function isAdmin(req) {
  return req.headers["x-user-role"] === "admin";
}

// API Sağlık Kontrolü
app.get("/v1", (req, res) => {
  res.send("Cutify API çalışıyor");
});

// 1. Giriş Yap
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

// 2. Üye Olma
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

// 3. Berberleri Listeleme
app.get("/v1/barbers", async (req, res) => {
  const [barbers] = await db.query("SELECT * FROM barbers");
  res.status(200).json(barbers);
});

// 4. Berber Detay Görüntüleme
app.get("/v1/barbers/:barberId", async (req, res) => {
  const [rows] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  if (rows.length === 0) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }
  res.status(200).json(rows[0]);
});

// 5. Randevu Oluşturma
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

// 6. Randevu Güncelleme
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

// 7. Randevu Silme
app.delete("/v1/appointments/:appointmentId", async (req, res) => {
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }
  await db.query("DELETE FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu silindi", appointment: existing[0] });
});

// 8. Profil Görüntüleme
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

// 9. Profil Güncelleme
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

// 10. Berber Hizmetlerini Listeleme
app.get("/v1/barbers/:barberId/services", async (req, res) => {
  const [services] = await db.query("SELECT * FROM services WHERE barberId = ?", [req.params.barberId]);
  if (services.length === 0) {
    return res.status(404).json({ message: "Hizmet bulunamadı" });
  }
  res.status(200).json(services);
});

// 11. Randevu Durumunu Güncelleme (Admin)
app.put("/v1/appointments/:appointmentId/status", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }
  const [existing] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }
  const { status } = req.body;
  await db.query("UPDATE appointments SET status = ? WHERE id = ?", [status, req.params.appointmentId]);
  const [updated] = await db.query("SELECT * FROM appointments WHERE id = ?", [req.params.appointmentId]);
  res.status(200).json({ message: "Randevu durumu güncellendi", appointment: updated[0] });
});

// 12. Berber Ekleme (Admin)
app.post("/v1/barbers", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }
  const { name, location, phone } = req.body;
  const [result] = await db.query(
    "INSERT INTO barbers (name, location, phone) VALUES (?, ?, ?)",
    [name, location, phone]
  );
  res.status(201).json({
    message: "Berber eklendi",
    barber: { id: result.insertId, name, location, phone },
  });
});

// 13. Berber Güncelleme (Admin)
app.put("/v1/barbers/:barberId", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }
  const [existing] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }
  const { name, location, phone } = req.body;
  await db.query(
    "UPDATE barbers SET name = COALESCE(?, name), location = COALESCE(?, location), phone = COALESCE(?, phone) WHERE id = ?",
    [name || null, location || null, phone || null, req.params.barberId]
  );
  const [updated] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  res.status(200).json({ message: "Berber güncellendi", barber: updated[0] });
});

// 14. Berber Silme (Admin)
app.delete("/v1/barbers/:barberId", async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }
  const [existing] = await db.query("SELECT * FROM barbers WHERE id = ?", [req.params.barberId]);
  if (existing.length === 0) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }
  await db.query("DELETE FROM barbers WHERE id = ?", [req.params.barberId]);
  res.status(200).json({ message: "Berber silindi", barber: existing[0] });
});

// Başlat
initDB().then(() => {
  app.listen(PORT, () => {
    console.log(`Server ${PORT} portunda çalışıyor`);
  });
}).catch((err) => {
  console.error("Veritabanı bağlantı hatası:", err);
});