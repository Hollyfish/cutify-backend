const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

function isAdmin(req) {
  return req.headers["x-user-role"] === "admin";
}

let users = [
  {
    id: "1",
    firstName: "Arda",
    lastName: "Kabay",
    email: "arda@example.com",
    phone: "+905551112233",
    password: "123456",
    role: "user"
  },
  {
    id: "2",
    firstName: "Admin",
    lastName: "User",
    email: "admin@cutify.com",
    phone: "+905550000000",
    password: "123456",
    role: "admin"
  }
];

let barbers = [
  {
    id: "1",
    name: "Berber Ahmet",
    location: "Isparta Merkez",
    phone: "+905551234567",
    availableSlots: ["2026-04-04 10:00", "2026-04-04 11:00"]
  },
  {
    id: "2",
    name: "Berber Mehmet",
    location: "Isparta Çünür",
    phone: "+905559876543",
    availableSlots: ["2026-04-04 13:00", "2026-04-04 15:00"]
  }
];

let barberServices = {
  "1": [
    { id: "1", name: "Saç Kesimi", price: 200 },
    { id: "2", name: "Sakal Tıraşı", price: 100 }
  ],
  "2": [
    { id: "3", name: "Saç Kesimi", price: 180 },
    { id: "4", name: "Yıkama", price: 80 }
  ]
};

let appointments = [
  {
    id: "1",
    userId: "1",
    barberId: "1",
    serviceId: "1",
    date: "2026-04-05",
    time: "14:00",
    status: "Aktif"
  }
];

app.get("/v1", (req, res) => {
  res.send("Cutify API çalışıyor");
});

// 1. Giriş Yap
app.post("/v1/auth/login", (req, res) => {
  const { email, password } = req.body;

  const user = users.find(
    (u) => u.email === email && u.password === password
  );

  if (!user) {
    return res.status(401).json({ message: "Email veya şifre hatalı" });
  }

  res.status(200).json({
    message: "Giriş başarılı",
    token: "fake-jwt-token",
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role
    }
  });
});

// 2. Üye Olma
app.post("/v1/auth/register", (req, res) => {
  const { firstName, lastName, email, phone, password } = req.body;

  const existingUser = users.find((u) => u.email === email);
  if (existingUser) {
    return res.status(400).json({ message: "Bu email zaten kayıtlı" });
  }

  const newUser = {
    id: String(users.length + 1),
    firstName,
    lastName,
    email,
    phone,
    password,
    role: "user"
  };

  users.push(newUser);

  res.status(201).json({
    message: "Kullanıcı oluşturuldu",
    user: newUser
  });
});

// 3. Berberleri Listeleme
app.get("/v1/barbers", (req, res) => {
  const result = barbers.map((barber) => ({
    id: barber.id,
    name: barber.name,
    location: barber.location,
    phone: barber.phone,
    availableSlots: barber.availableSlots
  }));

  res.status(200).json(result);
});

// 4. Berber Detay Görüntüleme
app.get("/v1/barbers/:barberId", (req, res) => {
  const barber = barbers.find((b) => b.id === req.params.barberId);

  if (!barber) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }

  res.status(200).json(barber);
});

// 5. Randevu Oluşturma
app.post("/v1/appointments", (req, res) => {
  const { userId, barberId, serviceId, date, time } = req.body;

  const newAppointment = {
    id: String(appointments.length + 1),
    userId,
    barberId,
    serviceId,
    date,
    time,
    status: "Aktif"
  };

  appointments.push(newAppointment);

  res.status(201).json({
    message: "Randevu oluşturuldu",
    appointment: newAppointment
  });
});

// 6. Randevu Güncelleme
app.put("/v1/appointments/:appointmentId", (req, res) => {
  const appointment = appointments.find(
    (a) => a.id === req.params.appointmentId
  );

  if (!appointment) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }

  const { date, time, serviceId } = req.body;

  if (date) appointment.date = date;
  if (time) appointment.time = time;
  if (serviceId) appointment.serviceId = serviceId;

  res.status(200).json({
    message: "Randevu güncellendi",
    appointment
  });
});

// 7. Randevu Silme
app.delete("/v1/appointments/:appointmentId", (req, res) => {
  const appointmentIndex = appointments.findIndex(
    (a) => a.id === req.params.appointmentId
  );

  if (appointmentIndex === -1) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }

  const deletedAppointment = appointments[appointmentIndex];
  appointments.splice(appointmentIndex, 1);

  res.status(200).json({
    message: "Randevu silindi",
    appointment: deletedAppointment
  });
});

// 8. Profil Görüntüleme
app.get("/v1/users/:userId", (req, res) => {
  const user = users.find((u) => u.id === req.params.userId);

  if (!user) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  const userAppointments = appointments.filter((a) => a.userId === user.id);

  res.status(200).json({
    user: {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      role: user.role
    },
    appointments: userAppointments
  });
});

// 9. Profil Güncelleme
app.put("/v1/users/:userId", (req, res) => {
  const user = users.find((u) => u.id === req.params.userId);

  if (!user) {
    return res.status(404).json({ message: "Kullanıcı bulunamadı" });
  }

  const { firstName, lastName, email, phone, password } = req.body;

  if (firstName) user.firstName = firstName;
  if (lastName) user.lastName = lastName;
  if (email) user.email = email;
  if (phone) user.phone = phone;
  if (password) user.password = password;

  res.status(200).json({
    message: "Profil güncellendi",
    user
  });
});

// 10. Berber Hizmetlerini Listeleme
app.get("/v1/barbers/:barberId/services", (req, res) => {
  const services = barberServices[req.params.barberId];

  if (!services) {
    return res.status(404).json({ message: "Hizmet bulunamadı" });
  }

  res.status(200).json(services);
});

// 11. Randevu Durumunu Güncelleme (Admin)
app.put("/v1/appointments/:appointmentId/status", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }

  const appointment = appointments.find(
    (a) => a.id === req.params.appointmentId
  );

  if (!appointment) {
    return res.status(404).json({ message: "Randevu bulunamadı" });
  }

  const { status } = req.body;
  appointment.status = status;

  res.status(200).json({
    message: "Randevu durumu güncellendi",
    appointment
  });
});

// 12. Berber Ekleme (Admin)
app.post("/v1/barbers", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }

  const { name, location, phone } = req.body;

  const newBarber = {
    id: String(barbers.length + 1),
    name,
    location,
    phone,
    availableSlots: []
  };

  barbers.push(newBarber);

  res.status(201).json({
    message: "Berber eklendi",
    barber: newBarber
  });
});

// 13. Berber Güncelleme (Admin)
app.put("/v1/barbers/:barberId", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }

  const barber = barbers.find((b) => b.id === req.params.barberId);

  if (!barber) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }

  const { name, location, phone } = req.body;

  if (name) barber.name = name;
  if (location) barber.location = location;
  if (phone) barber.phone = phone;

  res.status(200).json({
    message: "Berber güncellendi",
    barber
  });
});

// 14. Berber Silme (Admin)
app.delete("/v1/barbers/:barberId", (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ message: "Bu işlem için admin yetkisi gerekli" });
  }

  const barberIndex = barbers.findIndex((b) => b.id === req.params.barberId);

  if (barberIndex === -1) {
    return res.status(404).json({ message: "Berber bulunamadı" });
  }

  const deletedBarber = barbers[barberIndex];
  barbers.splice(barberIndex, 1);

  res.status(200).json({
    message: "Berber silindi",
    barber: deletedBarber
  });
});

app.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor`);
});