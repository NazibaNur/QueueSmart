const pool = require("../db/database");

function normalizeAppointment(a) {
  const date = a.date instanceof Date
    ? a.date.toISOString().split("T")[0]
    : String(a.date).split("T")[0];
  const time = String(a.time).slice(0, 5); // "HH:MM:SS" -> "HH:MM"
  return {
    id: a.id,
    userId: a.user_id,
    serviceId: a.service_id,
    serviceName: a.service_name ?? null,
    date,
    time,
    duration: a.duration,
    status: a.status,
    createdAt: a.created_at,
  };
}

// GET /appointments — all appointments (staff/admin)
async function getAppointments(_req, res) {
  try {
    const result = await pool.query(
      `SELECT a.*, s.name AS service_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       ORDER BY a.date ASC, a.time ASC`
    );
    res.json(result.rows.map(normalizeAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
}

// GET /appointments/my — current user's appointments
async function getMyAppointments(req, res) {
  try {
    const user_id = req.user.id;
    const result = await pool.query(
      `SELECT a.*, s.name AS service_name
       FROM appointments a
       JOIN services s ON a.service_id = s.id
       WHERE a.user_id = $1
       ORDER BY a.date ASC, a.time ASC`,
      [user_id]
    );
    res.json(result.rows.map(normalizeAppointment));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
}

// POST /appointments — create appointment
async function createAppointment(req, res) {
  try {
    const user_id = req.user.id;
    const { service_id, date, time } = req.body;

    if (!service_id || !date || !time) {
      return res.status(400).json({ error: "service_id, date, and time are required" });
    }

    // Validate date is not in the past
    const apptDate = new Date(`${date}T${time}`);
    if (apptDate < new Date()) {
      return res.status(400).json({ error: "Cannot book an appointment in the past" });
    }

    const serviceResult = await pool.query(
      `SELECT id, expected_duration FROM services WHERE id = $1 AND is_open = TRUE`,
      [service_id]
    );
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ error: "Service not found or not open" });
    }

    const duration = serviceResult.rows[0].expected_duration;

    // Check for existing upcoming appointment by this user for this service+date+time
    const existing = await pool.query(
      `SELECT id FROM appointments
       WHERE user_id = $1 AND service_id = $2 AND date = $3 AND time = $4 AND status = 'upcoming'`,
      [user_id, service_id, date, time]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "You already have an appointment at this time" });
    }

    const result = await pool.query(
      `INSERT INTO appointments (user_id, service_id, date, time, duration)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user_id, service_id, date, time, duration]
    );

    const appt = result.rows[0];
    const serviceNameResult = await pool.query(`SELECT name FROM services WHERE id = $1`, [service_id]);
    appt.service_name = serviceNameResult.rows[0]?.name ?? null;

    return res.status(201).json(normalizeAppointment(appt));
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "This time slot is already booked" });
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to create appointment" });
  }
}

// PATCH /appointments/:id/cancel — cancel appointment
async function cancelAppointment(req, res) {
  try {
    const user_id = req.user.id;
    const { id } = req.params;

    const result = await pool.query(
      `UPDATE appointments
       SET status = 'cancelled'
       WHERE id = $1 AND user_id = $2 AND status = 'upcoming'
       RETURNING *`,
      [id, user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Appointment not found or already cancelled" });
    }

    return res.json(normalizeAppointment(result.rows[0]));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to cancel appointment" });
  }
}

module.exports = { getAppointments, getMyAppointments, createAppointment, cancelAppointment };
