'use client'

import React, { useEffect, useState } from 'react'
import { useDocumentInfo } from '@payloadcms/ui'

type StatsResponse = {
  recipients: number
  byStatus: Record<string, number>
}

const ROWS: Array<{ label: string; key: string }> = [
  { label: 'Sent', key: 'sent' },
  { label: 'Delivered', key: 'delivered' },
  { label: 'Opened', key: 'opened' },
  { label: 'Clicked', key: 'clicked' },
  { label: 'Bounced', key: 'bounced' },
  { label: 'Failed', key: 'failed' },
]

export const EmailStatsField: React.FC = () => {
  const { id } = useDocumentInfo()
  const [stats, setStats] = useState<StatsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetch(`/api/email-publishing/email-stats/${id}`, { credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data: StatsResponse) => {
        if (!cancelled) setStats(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
    }
  }, [id])

  let body: React.ReactNode
  if (!id) {
    body = <p style={{ opacity: 0.6 }}>Stats available after this Email is saved.</p>
  } else if (error) {
    body = <p style={{ color: 'var(--theme-error-500, #b91c1c)' }}>Failed to load stats: {error}</p>
  } else if (!stats) {
    body = <p style={{ opacity: 0.6 }}>Loading stats...</p>
  } else {
    body = (
      <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
        <tbody>
          <tr>
            <td style={{ padding: '2px 4px' }}>Recipients</td>
            <td style={{ padding: '2px 4px', textAlign: 'right' }}>{stats.recipients}</td>
          </tr>
          {ROWS.map(({ label, key }) => {
            const count = stats.byStatus[key] ?? 0
            const pct = stats.recipients > 0 ? Math.round((count / stats.recipients) * 100) : 0
            return (
              <tr key={key}>
                <td style={{ padding: '2px 4px' }}>{label}</td>
                <td style={{ padding: '2px 4px', textAlign: 'right' }}>
                  {count} {stats.recipients > 0 ? `(${pct}%)` : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    )
  }

  return (
    <div>
      <hr style={{ margin: '0 0 16px', border: 'none', borderTop: '1px solid var(--theme-elevation-150, #ccc)' }} />
      <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600 }}>Stats</h4>
      {body}
    </div>
  )
}
