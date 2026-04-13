import { useEffect, useMemo } from 'react'
import { useTabStore } from '../stores/tabStore'
import { useSessionStore } from '../stores/sessionStore'
import { useChatStore } from '../stores/chatStore'
import { useCLITaskStore } from '../stores/cliTaskStore'
import { useTranslation } from '../i18n'
import { MessageList } from '../components/chat/MessageList'
import { ChatInput } from '../components/chat/ChatInput'
import { TeamStatusBar } from '../components/teams/TeamStatusBar'
import { SessionTaskBar } from '../components/chat/SessionTaskBar'

const TASK_POLL_INTERVAL_MS = 1000

export function ActiveSession() {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const sessions = useSessionStore((s) => s.sessions)
  const connectToSession = useChatStore((s) => s.connectToSession)
  const sessionState = useChatStore((s) => activeTabId ? s.sessions[activeTabId] : undefined)
  const fetchSessionTasks = useCLITaskStore((s) => s.fetchSessionTasks)
  const trackedTaskSessionId = useCLITaskStore((s) => s.sessionId)
  const hasIncompleteTasks = useCLITaskStore((s) => s.tasks.some((task) => task.status !== 'completed'))
  const chatState = sessionState?.chatState ?? 'idle'
  const tokenUsage = sessionState?.tokenUsage ?? { input_tokens: 0, output_tokens: 0 }

  const session = sessions.find((s) => s.id === activeTabId)

  useEffect(() => {
    if (activeTabId) {
      connectToSession(activeTabId)
    }
  }, [activeTabId, connectToSession])

  useEffect(() => {
    if (!activeTabId) return

    const shouldPollTasks =
      chatState !== 'idle' ||
      (trackedTaskSessionId === activeTabId && hasIncompleteTasks)

    if (!shouldPollTasks) return

    void fetchSessionTasks(activeTabId)

    const timer = setInterval(() => {
      void fetchSessionTasks(activeTabId)
    }, TASK_POLL_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [
    activeTabId,
    chatState,
    trackedTaskSessionId,
    hasIncompleteTasks,
    fetchSessionTasks,
  ])

  const t = useTranslation()
  const messages = sessionState?.messages ?? []
  const streamingText = sessionState?.streamingText ?? ''
  const isEmpty = messages.length === 0 && !streamingText

  const isActive = chatState !== 'idle'
  const totalTokens = tokenUsage.input_tokens + tokenUsage.output_tokens

  const lastUpdated = useMemo(() => {
    if (!session?.modifiedAt) return ''
    const diff = Date.now() - new Date(session.modifiedAt).getTime()
    if (diff < 60000) return t('session.timeJustNow')
    if (diff < 3600000) return t('session.timeMinutes', { n: Math.floor(diff / 60000) })
    if (diff < 86400000) return t('session.timeHours', { n: Math.floor(diff / 3600000) })
    return t('session.timeDays', { n: Math.floor(diff / 86400000) })
  }, [session?.modifiedAt, t])

  if (!activeTabId) return null

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden bg-background text-on-surface">
      {isEmpty ? (
        /* Welcome hero — same look as EmptySession */
        <div className="flex flex-1 flex-col items-center justify-center p-8 pb-32">
          <div className="flex max-w-md flex-col items-center text-center">
            <img src="/app-icon.jpg" alt="Claude Code Haha" className="mb-6 h-24 w-24 rounded-[22px] shadow-[0_2px_12px_rgba(0,0,0,0.06)]" />
            <h1 className="mb-2 text-3xl font-extrabold tracking-tight text-[var(--color-text-primary)]" style={{ fontFamily: "'Manrope', sans-serif" }}>
              {t('empty.title')}
            </h1>
            <p className="mx-auto max-w-xs text-[var(--color-text-secondary)]" style={{ fontFamily: "'Inter', sans-serif" }}>
              {t('empty.subtitle')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Session info header */}
          <div className="mx-auto flex w-full max-w-[860px] items-center border-b border-outline-variant/10 px-8 py-3">
            <div className="flex-1">
              <h1 className="text-lg font-bold font-headline text-on-surface leading-tight">
                {session?.title || t('session.untitled')}
              </h1>
              <div className="flex items-center gap-2 text-[10px] text-outline font-medium mt-1">
                {isActive && (
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)] animate-pulse-dot" />
                    {t('session.active')}
                  </span>
                )}
                {totalTokens > 0 && (
                  <>
                    <span className="text-[var(--color-outline)]">·</span>
                    <span>{totalTokens.toLocaleString()} t</span>
                  </>
                )}
                {lastUpdated && (
                  <>
                    <span className="text-[var(--color-outline)]">·</span>
                    <span>{t('session.lastUpdated', { time: lastUpdated })}</span>
                  </>
                )}
                {session?.messageCount !== undefined && session.messageCount > 0 && (
                  <>
                    <span className="text-[var(--color-outline)]">·</span>
                    <span>{t('session.messages', { count: session.messageCount })}</span>
                  </>
                )}
              </div>
              {session?.workDirExists === false && (
                <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-lg border border-[var(--color-error)]/20 bg-[var(--color-error)]/8 px-3 py-1.5 text-[11px] text-[var(--color-error)]">
                  <span className="material-symbols-outlined text-[14px]">warning</span>
                  <span className="truncate">
                    {t('session.workspaceUnavailable', { dir: session.workDir || 'directory no longer exists' })}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Message stream */}
          <MessageList />
        </>
      )}

      {/* Session task bar — sticky at bottom */}
      <SessionTaskBar />

      {/* Team status bar */}
      <TeamStatusBar />

      {/* Chat input */}
      <ChatInput />
    </div>
  )
}
