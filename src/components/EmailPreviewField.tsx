'use client'

import React, { useEffect, useState } from 'react'
import { useFormFields } from '@payloadcms/ui'

// Normalizes the `posts` relationship field's live value (an array of
// Post IDs for a hasMany field with a single relationTo) to a stable,
// comma-joined string - used both as the fetch param and as a dependency
// key so the effect only re-fires when the actual selection changes, not
// on every unrelated form re-render.
const toIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value.map((entry) => (typeof entry === 'string' || typeof entry === 'number' ? String(entry) : String((entry as { id?: unknown })?.id ?? ''))).filter(Boolean)
}

export const EmailPreviewField: React.FC = () => {
  const postIds = useFormFields(([fields]) => toIdList(fields.posts?.value))
  const postIdsKey = postIds.join(',')

  const [html, setHtml] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    // No cleanup of `html`/`error` needed here - the render below already
    // guards on `postIdsKey` before ever reading them, so stale state from
    // a previous selection is simply never shown once it's empty.
    if (!postIdsKey) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      fetch(`/api/email-publishing/render-preview?postIds=${encodeURIComponent(postIdsKey)}`, { credentials: 'include' })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
        .then((data: { html: string }) => {
          if (!cancelled) {
            setHtml(data.html)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : String(err))
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [postIdsKey])

  return (
    <div>
      <h4 style={{ margin: '0 0 8px', fontSize: '13px', fontWeight: 600 }}>Preview</h4>
      {!postIdsKey ? (
        <p style={{ opacity: 0.6 }}>Add Posts above to preview the composed email body.</p>
      ) : (
        <>
          {error && <p style={{ color: 'var(--theme-error-500, #b91c1c)' }}>Failed to load preview: {error}</p>}
          <iframe
            title="Email preview"
            srcDoc={html}
            sandbox=""
            style={{
              width: '100%',
              height: 480,
              border: '1px solid var(--theme-elevation-150, #ccc)',
              borderRadius: 4,
              background: '#fff',
              opacity: loading ? 0.6 : 1,
            }}
          />
        </>
      )}
    </div>
  )
}
