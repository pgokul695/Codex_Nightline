import { AnimatePresence } from 'framer-motion'
import EventCard from './EventCard'

export function EventList({ extractedEvents, setExtractedEvents }) {
  const updateEvent = (id, changes) => {
    setExtractedEvents((events) =>
      events.map((event) => (event.id === id ? { ...event, ...changes } : event)),
    )
  }

  const deleteEvent = (id) => {
    setExtractedEvents((events) => events.filter((event) => event.id !== id))
  }

  if (!extractedEvents.length) {
    return <p className="empty-state">Your reviewed events will appear here.</p>
  }

  return (
    <section className="event-list" aria-label="Extracted events">
      <div className="event-list__intro">
        <p className="eyebrow">Review before export</p>
        <h2>Confirm each detail</h2>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {extractedEvents.map((event) => (
          <EventCard key={event.id} event={event} onUpdate={updateEvent} onDelete={deleteEvent} />
        ))}
      </AnimatePresence>
    </section>
  )
}

export default EventList
