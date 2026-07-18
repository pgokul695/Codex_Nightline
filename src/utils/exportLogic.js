import { Capacitor } from '@capacitor/core'

function validDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime())
}

function icsDate(value) {
  const date = validDate(value) ? value : new Date()
  const pad = (number) => String(number).padStart(2, '0')

  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
  ].join('') + `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function icsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
}

function createCalendar(events) {
  const eventBlocks = events.map((event) => {
    const lines = [
      'BEGIN:VEVENT',
      `UID:${icsText(event.id)}`,
      `SUMMARY:${icsText(event.title || 'Notification Event')}`,
      `LOCATION:${icsText(event.location)}`,
      `DTSTART:${icsDate(event.start)}`,
    ]

    if (validDate(event.end)) lines.push(`DTEND:${icsDate(event.end)}`)
    lines.push('END:VEVENT')
    return lines.join('\r\n')
  })

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Schedger//Event Export//EN',
    'CALSCALE:GREGORIAN',
    ...eventBlocks,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}

function isTauri() {
  return typeof window !== 'undefined' && Boolean(window.__TAURI_METADATA__)
}

async function exportToTauri(calendar) {
  try {
    // Tauri v2 keeps filesystem and shell access in their official plugins.
    const [{ writeTextFile }, { tempDir, join }, { open }] = await Promise.all([
      import('@tauri-apps/plugin-fs'),
      import('@tauri-apps/api/path'),
      import('@tauri-apps/plugin-shell'),
    ])
    const filePath = await join(
      await tempDir(),
      `schedger-events-${Date.now()}.ics`,
    )

    await writeTextFile(filePath, calendar)
    await open(filePath)
  } catch (error) {
    throw new Error(
      `Unable to open the exported calendar file: ${error instanceof Error ? error.message : 'unknown error'}`,
    )
  }
}

async function exportToCapacitor(events) {
  const { CapacitorCalendar } = await import('@capgo/capacitor-calendar')

  // Native event editors must be presented one at a time on Android and iOS.
  for (const event of events) {
    await CapacitorCalendar.createEventWithPrompt({
      title: event.title || 'Notification Event',
      location: event.location,
      startDate: validDate(event.start) ? event.start.getTime() : Date.now(),
      ...(validDate(event.end) ? { endDate: event.end.getTime() } : {}),
    })
  }
}

function exportToWeb(calendar) {
  if (typeof document === 'undefined') {
    throw new Error('Calendar downloads are only available in a browser window.')
  }

  const url = URL.createObjectURL(new Blob([calendar], { type: 'text/calendar' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'schedger-events.ics'
  link.hidden = true
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

/**
 * Sends the reviewed events to the calendar mechanism provided by this runtime.
 * Platform-specific details intentionally stay inside this module.
 */
export async function exportEvents(extractedEvents) {
  const events = Array.isArray(extractedEvents) ? extractedEvents : []
  if (!events.length) throw new Error('Add at least one event before exporting.')

  if (isTauri()) {
    await exportToTauri(createCalendar(events))
    return { platform: 'tauri', count: events.length }
  }

  if (Capacitor.isNativePlatform()) {
    await exportToCapacitor(events)
    return { platform: 'capacitor', count: events.length }
  }

  exportToWeb(createCalendar(events))
  return { platform: 'web', count: events.length }
}
