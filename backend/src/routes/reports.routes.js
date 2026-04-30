const express = require("express")
const router = express.Router()
const { getReport, exportReportCsv } = require("../controllers/reports.controller")
const { verifyToken, requireRole } = require("../middleware/auth")

router.get("/", verifyToken, requireRole("administrator"), getReport)
router.get("/export.csv", verifyToken, requireRole("administrator"), exportReportCsv)

module.exports = router
