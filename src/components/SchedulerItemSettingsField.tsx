'use client'

import React, { useEffect, useState } from 'react'
import { useFormFields } from '@payloadcms/ui'

type SchedulerItemSummary = {
  label?: string
  status: string
  sendAt?: string
  recipientCount?: number
  sentAt?: string
  lastError?: string
}

const toId = (value: unknown): string | undefined => {
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  if (value && typeof value === 'object' && 'id' in value) return String((value as { id: unknown }).id)
  return undefined
}

const ROWS: Array<{ label: string; key: keyof SchedulerItemSummary; format?: (value: unknown) => string }> = [
  { label: 'Status', key: 'status' },
  { label: 'Send at', key: 'sendAt', format: (value) => (value ? new Date(value as string).toLocaleString() : '—') },
  { label: 'Recipients', key: 'recipientCount', format: (value) => String(value ?? 0) },
  { label: 'Sent at', key: 'sentAt', format: (value) => (value ? new Date(value as string).toLocaleString() : '—') },
]

export const SchedulerItemSettingsField: React.FC = () => {
  const schedulerItemId = useFormFields(([fields]) => toId(fields.schedulerItem?.value))

  const [item, setItem] = useState<SchedulerItemSummary | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // No cleanup of `item`/`error` needed here - the render below already
    // guards on `schedulerItemId` before ever reading them, so stale state
    // from a previous selection is simply never shown once it's empty.
    if (!schedulerItemId) return
    let cancelled = false
    fetch(`/api/scheduler-items/${schedulerItemId}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: SchedulerItemSummary) => {
        if (!cancelled) {
          setItem(data)
          setError(null)
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [schedulerItemId])

  if (!schedulerItemId) {
    return <p style={{ opacity: 0.6 }}>Link a Scheduler Item above to see its settings.</p>
  }

  if (error) {
    return <p style={{ color: 'var(--theme-error-500, #b91c1c)' }}>Failed to load: {error}</p>
  }

  if (!item) {
    return <p style={{ opacity: 0.6 }}>Loading...</p>
  }

  return (
    <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
      <tbody>
        {ROWS.map(({ label, key, format }) => (
          <tr key={key}>
            <td style={{ padding: '2px 4px' }}>{label}</td>
            <td style={{ padding: '2px 4px', textAlign: 'right' }}>{format ? format(item[key]) : String(item[key] ?? '—')}</td>
          </tr>
        ))}
        {item.status === 'failed' && item.lastError && (
          <tr>
            <td colSpan={2} style={{ padding: '4px', color: 'var(--theme-error-500, #b91c1c)' }}>
              {item.lastError}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
