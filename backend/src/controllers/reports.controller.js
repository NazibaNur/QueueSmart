const db = require("../db/database")

const ACTIVE_QUEUE_STATUSES = ["waiting", "almost-ready"]

function toIsoDate(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function parseDate(value, fallback) {
  if (!value) return fallback
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed
}

function getResolvedFilters(query) {
  const now = new Date()
  const defaultStart = new Date(now)
  defaultStart.setDate(defaultStart.getDate() - 30)

  const startDate = parseDate(query.startDate, defaultStart)
  const endDate = parseDate(query.endDate, now)

  if (!startDate || !endDate) {
    return { error: "startDate and endDate must be valid dates" }
  }
  if (startDate > endDate) {
    return { error: "startDate must be before endDate" }
  }

  return {
    startDate,
    endDate,
    serviceId: query.serviceId || null,
  }
}

function buildServiceClause(filters, params, column) {
  if (!filters.serviceId) return ""
  params.push(filters.serviceId)
  return ` AND ${column} = $${params.length}`
}

async function fetchReportData(filters) {
  const serviceParams = []
  const serviceClause = buildServiceClause(filters, serviceParams, "id")
  const serviceResult = await db.query(
    `SELECT id, name, description, expected_duration, priority, is_open
     FROM services
     WHERE 1 = 1 ${serviceClause}
     ORDER BY name`,
    serviceParams
  )

  const historyParams = [filters.startDate, filters.endDate]
  const historyServiceClause = buildServiceClause(filters, historyParams, "h.service_id")

  const historyResult = await db.query(
    `SELECT
       h.id,
       h.user_id,
       up.name AS user_name,
       uc.email AS user_email,
       h.service_id,
       s.name AS service_name,
       s.description AS service_description,
       s.expected_duration,
       s.priority,
       s.is_open,
       h.status,
       h.joined_at,
       h.served_at,
       h.left_at,
       COALESCE(h.served_at, h.left_at, h.created_at) AS completed_at,
       CASE
         WHEN h.status = 'served' AND h.served_at IS NOT NULL
           THEN ROUND(EXTRACT(EPOCH FROM (h.served_at - h.joined_at)) / 60.0, 2)
         ELSE NULL
       END AS wait_minutes
     FROM history h
     JOIN user_credentials uc ON uc.id = h.user_id
     JOIN user_profiles up ON up.id = h.user_id
     JOIN services s ON s.id = h.service_id
     WHERE uc.role = 'user'
       AND COALESCE(h.served_at, h.left_at, h.created_at) BETWEEN $1 AND $2
       ${historyServiceClause}
     ORDER BY completed_at DESC`,
    historyParams
  )

  const activeParams = [filters.startDate, filters.endDate, ACTIVE_QUEUE_STATUSES]
  const activeServiceClause = buildServiceClause(filters, activeParams, "qe.service_id")

  const activeResult = await db.query(
    `SELECT
       qe.id,
       qe.user_id,
       up.name AS user_name,
       uc.email AS user_email,
       qe.service_id,
       s.name AS service_name,
       s.description AS service_description,
       s.expected_duration,
       s.priority,
       s.is_open,
       qe.status,
       qe.joined_at,
       qe.position
     FROM queue_entries qe
     JOIN user_credentials uc ON uc.id = qe.user_id
     JOIN user_profiles up ON up.id = qe.user_id
     JOIN services s ON s.id = qe.service_id
     WHERE uc.role = 'user'
       AND qe.status = ANY($3)
       AND qe.joined_at BETWEEN $1 AND $2
       ${activeServiceClause}
     ORDER BY qe.joined_at DESC`,
    activeParams
  )

  const history = historyResult.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    customerName: row.user_name,
    customerEmail: row.user_email,
    serviceId: row.service_id,
    serviceName: row.service_name,
    status: row.status,
    joinedAt: row.joined_at,
    completedAt: row.completed_at,
    waitMinutes: row.wait_minutes === null ? null : Number(row.wait_minutes),
  }))

  const activeEntries = activeResult.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    customerName: row.user_name,
    customerEmail: row.user_email,
    serviceId: row.service_id,
    serviceName: row.service_name,
    status: row.status,
    joinedAt: row.joined_at,
    position: row.position,
  }))

  const servedHistory = history.filter((item) => item.status === "served")
  const totalWaitMinutes = servedHistory.reduce((sum, item) => sum + (item.waitMinutes || 0), 0)
  const averageServedWaitMinutes = servedHistory.length
    ? Number((totalWaitMinutes / servedHistory.length).toFixed(2))
    : 0

  const userMap = new Map()
  const serviceMap = new Map()

  for (const service of serviceResult.rows) {
    serviceMap.set(service.id, {
      serviceId: service.id,
      name: service.name,
      description: service.description,
      expectedDuration: service.expected_duration,
      priority: service.priority,
      isOpen: service.is_open,
      activeQueueCount: 0,
      servedCount: 0,
      leftCount: 0,
      totalParticipations: 0,
      averageServedWaitMinutes: 0,
      _servedWaitTotal: 0,
    })
  }

  function getUser(row) {
    const key = row.userId
    if (!userMap.has(key)) {
      userMap.set(key, {
        userId: row.userId,
        name: row.customerName,
        email: row.customerEmail,
        totalParticipations: 0,
        servedCount: 0,
        leftCount: 0,
        activeCount: 0,
        lastActivityAt: null,
      })
    }
    return userMap.get(key)
  }

  function getService(row) {
    const key = row.service_id || row.serviceId
    if (!serviceMap.has(key)) {
      serviceMap.set(key, {
        serviceId: key,
        name: row.service_name || row.serviceName,
        description: row.service_description || "",
        expectedDuration: row.expected_duration,
        priority: row.priority,
        isOpen: row.is_open,
        activeQueueCount: 0,
        servedCount: 0,
        leftCount: 0,
        totalParticipations: 0,
        averageServedWaitMinutes: 0,
        _servedWaitTotal: 0,
      })
    }
    return serviceMap.get(key)
  }

  for (const row of historyResult.rows) {
    const user = getUser({
      userId: row.user_id,
      customerName: row.user_name,
      customerEmail: row.user_email,
    })
    user.totalParticipations += 1
    if (row.status === "served") user.servedCount += 1
    if (row.status === "left") user.leftCount += 1
    user.lastActivityAt = toIsoDate(row.completed_at)

    const service = getService(row)
    service.totalParticipations += 1
    if (row.status === "served") {
      service.servedCount += 1
      service._servedWaitTotal += Number(row.wait_minutes || 0)
    }
    if (row.status === "left") service.leftCount += 1
  }

  for (const row of activeResult.rows) {
    const user = getUser({
      userId: row.user_id,
      customerName: row.user_name,
      customerEmail: row.user_email,
    })
    user.totalParticipations += 1
    user.activeCount += 1
    const joinedAt = toIsoDate(row.joined_at)
    if (!user.lastActivityAt || joinedAt > user.lastActivityAt) user.lastActivityAt = joinedAt

    const service = getService(row)
    service.totalParticipations += 1
    service.activeQueueCount += 1
  }

  const users = Array.from(userMap.values()).sort((a, b) =>
    (b.lastActivityAt || "").localeCompare(a.lastActivityAt || "")
  )

  const services = Array.from(serviceMap.values())
    .map(({ _servedWaitTotal, ...service }) => ({
      ...service,
      averageServedWaitMinutes: service.servedCount
        ? Number((_servedWaitTotal / service.servedCount).toFixed(2))
        : 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return {
    filters: {
      startDate: filters.startDate.toISOString(),
      endDate: filters.endDate.toISOString(),
      serviceId: filters.serviceId,
    },
    summary: {
      totalCustomersServed: servedHistory.length,
      totalLeft: history.filter((item) => item.status === "left").length,
      totalQueueParticipations: history.length + activeEntries.length,
      activeQueueCount: activeEntries.length,
      averageServedWaitMinutes,
    },
    users,
    history,
    services,
  }
}

function csvValue(value) {
  if (value === null || value === undefined) return ""
  const text = String(value)
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

function addCsvSection(lines, title, headers, rows) {
  lines.push(title)
  lines.push(headers.map(csvValue).join(","))
  for (const row of rows) {
    lines.push(headers.map((header) => csvValue(row[header])).join(","))
  }
  lines.push("")
}

function reportToCsv(report) {
  const lines = []

  addCsvSection(lines, "Summary", ["Metric", "Value"], [
    { Metric: "Start Date", Value: report.filters.startDate },
    { Metric: "End Date", Value: report.filters.endDate },
    { Metric: "Service ID", Value: report.filters.serviceId || "All services" },
    { Metric: "Total Customers Served", Value: report.summary.totalCustomersServed },
    { Metric: "Total Left", Value: report.summary.totalLeft },
    { Metric: "Total Queue Participations", Value: report.summary.totalQueueParticipations },
    { Metric: "Active Queue Count", Value: report.summary.activeQueueCount },
    { Metric: "Average Served Wait Minutes", Value: report.summary.averageServedWaitMinutes },
  ])

  addCsvSection(
    lines,
    "Service Activity",
    [
      "Service ID",
      "Service Name",
      "Priority",
      "Open",
      "Expected Duration",
      "Active Queue Count",
      "Served Count",
      "Left Count",
      "Total Participations",
      "Average Served Wait Minutes",
    ],
    report.services.map((service) => ({
      "Service ID": service.serviceId,
      "Service Name": service.name,
      Priority: service.priority,
      Open: service.isOpen,
      "Expected Duration": service.expectedDuration,
      "Active Queue Count": service.activeQueueCount,
      "Served Count": service.servedCount,
      "Left Count": service.leftCount,
      "Total Participations": service.totalParticipations,
      "Average Served Wait Minutes": service.averageServedWaitMinutes,
    }))
  )

  addCsvSection(
    lines,
    "Customer Participation",
    ["User ID", "Name", "Email", "Total Participations", "Served Count", "Left Count", "Active Count", "Last Activity"],
    report.users.map((user) => ({
      "User ID": user.userId,
      Name: user.name,
      Email: user.email,
      "Total Participations": user.totalParticipations,
      "Served Count": user.servedCount,
      "Left Count": user.leftCount,
      "Active Count": user.activeCount,
      "Last Activity": user.lastActivityAt,
    }))
  )

  addCsvSection(
    lines,
    "Detailed History",
    ["Entry ID", "Customer Name", "Customer Email", "Service Name", "Status", "Joined At", "Completed At", "Wait Minutes"],
    report.history.map((entry) => ({
      "Entry ID": entry.id,
      "Customer Name": entry.customerName,
      "Customer Email": entry.customerEmail,
      "Service Name": entry.serviceName,
      Status: entry.status,
      "Joined At": entry.joinedAt,
      "Completed At": entry.completedAt,
      "Wait Minutes": entry.waitMinutes,
    }))
  )

  return lines.join("\n")
}

async function getReport(req, res) {
  const filters = getResolvedFilters(req.query)
  if (filters.error) {
    return res.status(400).json({ error: filters.error })
  }

  const report = await fetchReportData(filters)
  return res.json(report)
}

async function exportReportCsv(req, res) {
  const filters = getResolvedFilters(req.query)
  if (filters.error) {
    return res.status(400).json({ error: filters.error })
  }

  const report = await fetchReportData(filters)
  const csv = reportToCsv(report)
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", "attachment; filename=\"queuesmart-report.csv\"")
  return res.send(csv)
}

module.exports = { getReport, exportReportCsv, fetchReportData }
