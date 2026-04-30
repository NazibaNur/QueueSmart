"use client"

import { useState } from "react"
import { useApp } from "@/lib/app-context"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Clock, Users, Zap, CalendarClock, Footprints } from "lucide-react"
import type { Service } from "@/lib/types"

export function JoinQueueScreen({ onNavigate }: { onNavigate: (view: string) => void }) {
  const { services, queueEntries, joinQueue, getUserQueueEntry } = useApp()
  const currentEntry = getUserQueueEntry()
  const openServices = services.filter((s) => s.isOpen)

  const [selectedService, setSelectedService] = useState<Service | null>(null)
  const [joinType, setJoinType] = useState<"walk-in" | "appointment">("walk-in")
  const [appointmentDate, setAppointmentDate] = useState("")
  const [appointmentTime, setAppointmentTime] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  function getQueueLength(serviceId: string) {
    return queueEntries.filter(
      (e) => e.serviceId === serviceId && (e.status === "waiting" || e.status === "almost-ready")
    ).length
  }

  function getEstimatedWait(serviceId: string) {
    const service = services.find((s) => s.id === serviceId)
    const length = getQueueLength(serviceId)
    return Math.min(Math.ceil((service?.expectedDuration ?? 15) * length), 180)
  }

  const alreadyInQueue = !!currentEntry

  const priorityColors: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    medium: "bg-warning/15 text-warning-foreground border border-warning/30",
    high: "bg-destructive/10 text-destructive border border-destructive/30",
  }

  function openDialog(service: Service) {
    setSelectedService(service)
    setJoinType("walk-in")
    setAppointmentDate("")
    setAppointmentTime("")
    setError("")
  }

  async function handleConfirm() {
    if (!selectedService) return
    setError("")

    if (joinType === "appointment") {
      if (!appointmentDate || !appointmentTime) {
        setError("Please select both date and time for your appointment.")
        return
      }
      const dt = new Date(`${appointmentDate}T${appointmentTime}`)
      if (isNaN(dt.getTime())) {
        setError("Invalid date or time.")
        return
      }
    }

    setLoading(true)
    const appointmentISO =
      joinType === "appointment" ? new Date(`${appointmentDate}T${appointmentTime}`).toISOString() : undefined

    await joinQueue(selectedService.id, joinType, appointmentISO)
    setLoading(false)
    setSelectedService(null)
    onNavigate("queue-status")
  }

  const todayStr = new Date().toISOString().split("T")[0]

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Join a Queue</h1>
        <p className="text-muted-foreground mt-1">
          Select a clinic service to join its queue as a walk-in or with an appointment.
        </p>
      </div>

      {alreadyInQueue && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <p className="text-sm text-primary font-medium">
            You are already in a queue. Leave your current queue before joining another.
          </p>
        </div>
      )}

      {openServices.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No clinic services are currently available.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {openServices.map((service) => {
            const queueLength = getQueueLength(service.id)
            const estimatedWait = getEstimatedWait(service.id)
            const isAlreadyInThis = currentEntry?.serviceId === service.id
            return (
              <Card key={service.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{service.name}</CardTitle>
                    <Badge className={priorityColors[service.priority]} variant="outline">
                      {service.priority}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{service.description}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto flex flex-col gap-4">
                  <div className="flex items-center gap-6 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" />
                      {queueLength} in queue
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      est. {estimatedWait} min wait
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Zap className="h-3.5 w-3.5" />
                      {service.expectedDuration} min/person
                    </span>
                  </div>
                  <Button
                    onClick={() => !alreadyInQueue && openDialog(service)}
                    disabled={alreadyInQueue && !isAlreadyInThis}
                    variant={isAlreadyInThis ? "secondary" : "default"}
                    className="w-full"
                  >
                    {isAlreadyInThis ? "Already In Queue" : "Join Queue"}
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Join type dialog */}
      <Dialog open={!!selectedService} onOpenChange={(open) => { if (!open) setSelectedService(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Join — {selectedService?.name}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Type selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setJoinType("walk-in")}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  joinType === "walk-in"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Footprints className="h-6 w-6" />
                <span className="text-sm font-medium">Walk-in</span>
                <span className="text-xs text-center">Join queue now, served by arrival order</span>
              </button>
              <button
                type="button"
                onClick={() => setJoinType("appointment")}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                  joinType === "appointment"
                    ? "border-primary bg-primary/5 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <CalendarClock className="h-6 w-6" />
                <span className="text-sm font-medium">Appointment</span>
                <span className="text-xs text-center">Reserve a time slot, served at scheduled time</span>
              </button>
            </div>

            {/* Appointment date/time picker */}
            {joinType === "appointment" && (
              <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="appt-date">Date</Label>
                  <Input
                    id="appt-date"
                    type="date"
                    min={todayStr}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="appt-time">Time</Label>
                  <Input
                    id="appt-time"
                    type="time"
                    value={appointmentTime}
                    onChange={(e) => setAppointmentTime(e.target.value)}
                  />
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedService(null)}>Cancel</Button>
            <Button onClick={handleConfirm} disabled={loading}>
              {loading ? "Joining…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
