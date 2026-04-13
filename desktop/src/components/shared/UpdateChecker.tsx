import { useEffect, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useTranslation } from '../../i18n'

type UpdateInfo = {
  version: string
  downloading: boolean
  progress: number
}

let isTauri = false
try {
  isTauri = '__TAURI_INTERNALS__' in window
} catch {
  // not in Tauri
}

export function UpdateChecker() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const addToast = useUIStore((s) => s.addToast)
  const t = useTranslation()

  useEffect(() => {
    if (!isTauri) return

    const checkForUpdate = async () => {
      try {
        const { check } = await import('@tauri-apps/plugin-updater')
        const available = await check()
        if (available) {
          setUpdate({ version: available.version, downloading: false, progress: 0 })
          addToast({
            type: 'info',
            message: t('update.newVersion', { version: available.version }),
            duration: 0, // persist until dismissed
          })
        }
      } catch {
        // Updater not configured or no network — silently ignore
      }
    }

    // Check after a short delay so UI loads first
    const timer = setTimeout(checkForUpdate, 5000)
    return () => clearTimeout(timer)
  }, [addToast])

  if (!update || !isTauri) return null

  const handleUpdate = async () => {
    try {
      const { check } = await import('@tauri-apps/plugin-updater')
      const { relaunch } = await import('@tauri-apps/plugin-process')
      const available = await check()
      if (!available) return

      setUpdate((u) => u && { ...u, downloading: true })

      await available.downloadAndInstall((event) => {
        if (event.event === 'Started' && event.data.contentLength) {
          setUpdate((u) => u && { ...u, progress: 0 })
        } else if (event.event === 'Progress') {
          setUpdate((u) => {
            if (!u) return u
            return { ...u, progress: Math.min(u.progress + (event.data.chunkLength ?? 0), 100) }
          })
        } else if (event.event === 'Finished') {
          setUpdate((u) => u && { ...u, progress: 100 })
        }
      })

      await relaunch()
    } catch (err) {
      addToast({
        type: 'error',
        message: t('update.failed', { error: err instanceof Error ? err.message : String(err) }),
      })
      setUpdate((u) => u && { ...u, downloading: false })
    }
  }

  return (
    <div className="fixed top-4 right-4 z-[200] max-w-xs">
      <div className="bg-[var(--color-surface-container-low)] border border-[var(--color-border)] rounded-[var(--radius-lg)] shadow-[var(--shadow-dropdown)] p-4">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">
          {t('update.available', { version: update.version })}
        </p>
        {update.downloading ? (
          <div className="mt-2">
            <div className="h-1.5 bg-[var(--color-surface)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--color-text-accent)] transition-all duration-300"
                style={{ width: `${Math.min(update.progress, 100)}%` }}
              />
            </div>
            <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{t('update.downloading')}</p>
          </div>
        ) : (
          <div className="mt-2 flex gap-2">
            <button
              onClick={handleUpdate}
              className="px-3 py-1 text-xs font-medium rounded-[var(--radius-md)] bg-[var(--color-text-accent)] text-white hover:opacity-90 transition-opacity"
            >
              {t('update.now')}
            </button>
            <button
              onClick={() => setUpdate(null)}
              className="px-3 py-1 text-xs text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
            >
              {t('update.later')}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
