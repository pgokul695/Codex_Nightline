import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'

const cardTransition = { duration: 0.22, ease: 'easeOut' }

function formatDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return 'Date unavailable'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

export function EventCard({ event, onUpdate, onDelete }) {
  return (
    <motion.div
      className="event-card"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -14 }}
      transition={cardTransition}
    >
      <div className="event-card__heading">
        <span className="event-card__label">Extracted event</span>
        <button
          type="button"
          className="delete-button"
          aria-label={`Delete ${event.title}`}
          onClick={() => onDelete(event.id)}
        >
          <Trash2 size={18} aria-hidden="true" />
        </button>
      </div>
      <label>
        Title
        <input
          value={event.title}
          onChange={(input) => onUpdate(event.id, { title: input.target.value })}
        />
      </label>
      <label>
        Location
        <input
          value={event.location || ''}
          placeholder="Add location"
          onChange={(input) => onUpdate(event.id, { location: input.target.value || undefined })}
        />
      </label>
      <dl className="event-card__dates">
        <div>
          <dt>Starts</dt>
          <dd>{formatDate(event.start)}</dd>
        </div>
        <div>
          <dt>Ends</dt>
          <dd>{event.end ? formatDate(event.end) : 'No end time provided'}</dd>
        </div>
      </dl>
    </motion.div>
  )
}

export default EventCard
