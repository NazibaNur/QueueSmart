require("dotenv").config()
const { pool } = require("./database")
const { hashPasswordSync } = require("../utils/password")

async function seed() {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")

    // Clear existing data
    await client.query("DELETE FROM history")
    await client.query("DELETE FROM notifications")
    await client.query("DELETE FROM queue_entries")
    await client.query("DELETE FROM queues")
    await client.query("DELETE FROM services")
    await client.query("DELETE FROM user_profiles")
    await client.query("DELETE FROM user_credentials")

    await client.query("ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS type VARCHAR(15) NOT NULL DEFAULT 'walk-in'")
    await client.query("ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE")
    await client.query("ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS appointment_time TIMESTAMPTZ")
    await client.query("ALTER TABLE queue_entries ADD COLUMN IF NOT EXISTS appointment_reminder_sent BOOLEAN NOT NULL DEFAULT FALSE")

    // Seed services
    const svcResult = await client.query(`
      INSERT INTO services (id, name, description, expected_duration, priority, is_open, created_at)
      VALUES
        ('00000000-0000-0000-0000-000000000001', 'General Checkup', 'Routine health check and basic consultation.', 15, 'low', true, NOW() - INTERVAL '7 days'),
        ('00000000-0000-0000-0000-000000000002', 'Vaccination', 'Immunization and vaccine administration service.', 30, 'medium', true, NOW() - INTERVAL '5 days'),
        ('00000000-0000-0000-0000-000000000003', 'Blood Test', 'Sample collection and lab test screening.', 20, 'high', true, NOW() - INTERVAL '3 days'),
        ('00000000-0000-0000-0000-000000000004', 'Consultation', 'Doctor consultation for symptoms and treatment planning.', 25, 'medium', true, NOW() - INTERVAL '2 days'),
        ('00000000-0000-0000-0000-000000000005', 'Imaging', 'X-ray and diagnostic imaging intake.', 40, 'high', true, NOW() - INTERVAL '10 days'),
        ('00000000-0000-0000-0000-000000000006', 'Pharmacy Pickup', 'Prescription pickup and medication counseling.', 10, 'low', true, NOW() - INTERVAL '12 days')
      RETURNING id, name
    `)
    console.log("Services seeded:", svcResult.rows.map(s => s.name).join(", "))

    // Seed queues (one per service)
    await client.query(`
      INSERT INTO queues (service_id, status)
      SELECT id, 'open' FROM services
    `)

    // Seed users
    const users = [
      { email: "alice@example.com", name: "Alice Johnson", role: "user", password: "password123" },
      { email: "bob@example.com", name: "Bob Smith", role: "user", password: "password123" },
      { email: "charlie@example.com", name: "Charlie Lee", role: "user", password: "password123" },
      { email: "dana@example.com", name: "Dana White", role: "user", password: "password123" },
      { email: "elena@example.com", name: "Elena Garcia", role: "user", password: "password123" },
      { email: "farah@example.com", name: "Farah Khan", role: "user", password: "password123" },
      { email: "gabriel@example.com", name: "Gabriel Nguyen", role: "user", password: "password123" },
      { email: "hannah@example.com", name: "Hannah Patel", role: "user", password: "password123" },
      { email: "isaac@example.com", name: "Isaac Brown", role: "user", password: "password123" },
      { email: "julia@example.com", name: "Julia Martinez", role: "user", password: "password123" },
      { email: "kai@example.com", name: "Kai Wilson", role: "user", password: "password123" },
      { email: "lina@example.com", name: "Lina Chen", role: "user", password: "password123" },
      { email: "marcus@example.com", name: "Marcus Davis", role: "user", password: "password123" },
      { email: "nora@example.com", name: "Nora Anderson", role: "user", password: "password123" },
      { email: "omar@example.com", name: "Omar Hassan", role: "user", password: "password123" },
      { email: "priya@example.com", name: "Priya Shah", role: "user", password: "password123" },
      { email: "quinn@example.com", name: "Quinn Taylor", role: "user", password: "password123" },
      { email: "rosa@example.com", name: "Rosa Ramirez", role: "user", password: "password123" },
      { email: "sam@example.com", name: "Sam Robinson", role: "user", password: "password123" },
      { email: "tessa@example.com", name: "Tessa Moore", role: "user", password: "password123" },
      { email: "staff@example.com", name: "Staff User", role: "staff", password: "staff123", serviceId: "00000000-0000-0000-0000-000000000001" },
      { email: "nurse@example.com", name: "Nurse Avery", role: "staff", password: "staff123", serviceId: "00000000-0000-0000-0000-000000000003" },
      { email: "frontdesk@example.com", name: "Front Desk", role: "staff", password: "staff123", serviceId: "00000000-0000-0000-0000-000000000006" },
      { email: "admin@example.com", name: "Administrator", role: "administrator", password: "admin123" },
    ]

    const userIds = {}
    for (const u of users) {
      const hash = hashPasswordSync(u.password)
      const r = await client.query(
        "INSERT INTO user_credentials (email, password, role) VALUES ($1, $2, $3) RETURNING id",
        [u.email, hash, u.role]
      )
      const id = r.rows[0].id
      await client.query("INSERT INTO user_profiles (id, name, service_id) VALUES ($1, $2, $3)", [id, u.name, u.serviceId || null])
      userIds[u.email] = id
    }
    console.log("Users seeded:", Object.keys(userIds).join(", "))

    const getQueue = async (svcId) => {
      const r = await client.query("SELECT id FROM queues WHERE service_id = $1", [svcId])
      return r.rows[0].id
    }

    const svc1 = "00000000-0000-0000-0000-000000000001"
    const svc2 = "00000000-0000-0000-0000-000000000002"
    const svc3 = "00000000-0000-0000-0000-000000000003"
    const svc4 = "00000000-0000-0000-0000-000000000004"
    const svc5 = "00000000-0000-0000-0000-000000000005"
    const svc6 = "00000000-0000-0000-0000-000000000006"
    const serviceIds = [svc1, svc2, svc3, svc4, svc5, svc6]

    const queueIds = {}
    for (const serviceId of serviceIds) {
      queueIds[serviceId] = await getQueue(serviceId)
    }

    const customers = users.filter((u) => u.role === "user")
    const now = new Date()
    const dateAgo = (days, hour, minute) => {
      const d = new Date(now)
      d.setDate(d.getDate() - days)
      d.setHours(hour, minute, 0, 0)
      return d
    }
    const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000)

    // Completed history covers the default 30-day report range plus older records for date filtering.
    const historyRows = []
    for (let i = 0; i < 96; i++) {
      const customer = customers[i % customers.length]
      const serviceId = serviceIds[(i + Math.floor(i / 8)) % serviceIds.length]
      const daysAgo = (i % 45) + 1
      const joinedAt = dateAgo(daysAgo, 8 + (i % 9), (i * 7) % 50)
      const waitMinutes = 8 + ((i * 11) % 58)
      const left = i % 9 === 0 || i % 17 === 0
      historyRows.push({
        userId: userIds[customer.email],
        serviceId,
        status: left ? "left" : "served",
        joinedAt,
        servedAt: left ? null : addMinutes(joinedAt, waitMinutes),
        leftAt: left ? addMinutes(joinedAt, 5 + ((i * 3) % 35)) : null,
      })
    }

    for (const row of historyRows) {
      await client.query(
        `INSERT INTO history (user_id, service_id, status, joined_at, served_at, left_at, created_at)
         VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, COALESCE($5::timestamptz, $6::timestamptz))`,
        [row.userId, row.serviceId, row.status, row.joinedAt, row.servedAt, row.leftAt]
      )
    }
    console.log("History seeded:", historyRows.length, "completed queue records.")

    // Active queues give the report active counts and make staff queue screens feel populated.
    const activeEntries = [
      { email: "alice@example.com", serviceId: svc1, position: 1, status: "almost-ready", type: "walk-in", minutesAgo: 95, emergency: false },
      { email: "bob@example.com", serviceId: svc1, position: 2, status: "waiting", type: "appointment", minutesAgo: 50, emergency: false, appointmentMinutes: 20 },
      { email: "charlie@example.com", serviceId: svc1, position: 3, status: "waiting", type: "walk-in", minutesAgo: 20, emergency: true },
      { email: "dana@example.com", serviceId: svc2, position: 1, status: "almost-ready", type: "appointment", minutesAgo: 75, emergency: false, appointmentMinutes: -10 },
      { email: "elena@example.com", serviceId: svc2, position: 2, status: "waiting", type: "walk-in", minutesAgo: 35, emergency: false },
      { email: "farah@example.com", serviceId: svc3, position: 1, status: "waiting", type: "walk-in", minutesAgo: 110, emergency: true },
      { email: "gabriel@example.com", serviceId: svc3, position: 2, status: "waiting", type: "appointment", minutesAgo: 40, emergency: false, appointmentMinutes: 45 },
      { email: "hannah@example.com", serviceId: svc4, position: 1, status: "almost-ready", type: "walk-in", minutesAgo: 65, emergency: false },
      { email: "isaac@example.com", serviceId: svc4, position: 2, status: "waiting", type: "appointment", minutesAgo: 25, emergency: false, appointmentMinutes: 70 },
      { email: "julia@example.com", serviceId: svc5, position: 1, status: "waiting", type: "walk-in", minutesAgo: 55, emergency: false },
      { email: "kai@example.com", serviceId: svc5, position: 2, status: "waiting", type: "walk-in", minutesAgo: 15, emergency: true },
      { email: "lina@example.com", serviceId: svc6, position: 1, status: "waiting", type: "appointment", minutesAgo: 30, emergency: false, appointmentMinutes: 30 },
      { email: "marcus@example.com", serviceId: svc6, position: 2, status: "waiting", type: "walk-in", minutesAgo: 12, emergency: false },
    ]

    for (const entry of activeEntries) {
      const joinedAt = addMinutes(now, -entry.minutesAgo)
      const appointmentTime = entry.appointmentMinutes === undefined ? null : addMinutes(now, entry.appointmentMinutes)
      await client.query(
        `INSERT INTO queue_entries
          (queue_id, service_id, user_id, position, status, type, is_emergency, appointment_time, joined_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          queueIds[entry.serviceId],
          entry.serviceId,
          userIds[entry.email],
          entry.position,
          entry.status,
          entry.type,
          entry.emergency,
          appointmentTime,
          joinedAt,
        ]
      )
    }
    console.log("Queue entries seeded:", activeEntries.length, "active entries.")

    const notificationRows = [
      { email: "alice@example.com", title: "Almost Ready", message: "Please head toward General Checkup." },
      { email: "dana@example.com", title: "Appointment Check-in", message: "Your Vaccination appointment is ready for check-in." },
      { email: "farah@example.com", title: "Priority Review", message: "Your Blood Test queue position was prioritized." },
      { email: "admin@example.com", title: "Daily Report Ready", message: "Reporting data has been refreshed with demo seed activity." },
    ]

    for (const notification of notificationRows) {
      await client.query(
        "INSERT INTO notifications (user_id, title, message, read, created_at) VALUES ($1, $2, $3, false, NOW())",
        [userIds[notification.email], notification.title, notification.message]
      )
    }
    console.log("Notifications seeded:", notificationRows.length)

    await client.query("COMMIT")
    console.log("Seed complete.")
  } catch (err) {
    await client.query("ROLLBACK")
    console.error("Seed failed:", err.message)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

seed()
