const express = require("express");
const router = express.Router();
const {
  getAppointments,
  getMyAppointments,
  createAppointment,
  cancelAppointment,
} = require("../controllers/appointments.controller");
const { verifyToken, requireRole } = require("../middleware/auth");
const { requireFields } = require("../middleware/validate");

// GET /api/appointments — all (staff/admin)
router.get("/", verifyToken, requireRole("staff", "administrator"), getAppointments);

// GET /api/appointments/my — current user's appointments
router.get("/my", verifyToken, getMyAppointments);

// POST /api/appointments — create appointment
router.post("/", verifyToken, requireFields("service_id", "date", "time"), createAppointment);

// PATCH /api/appointments/:id/cancel — cancel appointment
router.patch("/:id/cancel", verifyToken, cancelAppointment);

module.exports = router;
