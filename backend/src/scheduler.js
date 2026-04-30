const db = require("./db/database")
const { createNotification } = require("./controllers/notifications.controller")

// Runs every 60 seconds
async function checkAppointmentReminders() {
  try {
    // Find appointments starting in 25–35 min that haven't been reminded yet
    const result = await db.query(
      `SELECT qe.id, qe.user_id, qe.appointment_time, s.name AS service_name
       FROM queue_entries qe
       JOIN services s ON qe.service_id = s.id
       WHERE qe.type = 'appointment'
         AND qe.status IN ('waiting', 'almost-ready')
         AND qe.appointment_reminder_sent = FALSE
         AND qe.appointment_time BETWEEN NOW() + INTERVAL '25 minutes'
                                     AND NOW() + INTERVAL '35 minutes'`
    )

    for (const entry of result.rows) {
      await createNotification(
        entry.user_id,
        "Appointment Reminder",
        `Your appointment for ${entry.service_name} is in 30 minutes. Please check in to the queue soon.`
      )
      await db.query(
        `UPDATE queue_entries SET appointment_reminder_sent = TRUE WHERE id = $1`,
        [entry.id]
      )
    }

    if (result.rows.length > 0) {
      console.log(`[Scheduler] Sent ${result.rows.length} appointment reminder(s)`)
    }
  } catch (err) {
    console.error("[Scheduler] Appointment reminder error:", err.message)
  }
}

function startScheduler() {
  setInterval(checkAppointmentReminders, 60 * 1000)
  console.log("[Scheduler] Started — checking appointment reminders every 60s")
}

module.exports = { startScheduler }
