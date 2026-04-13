import { useTabStore } from '../../stores/tabStore'
import { useTeamStore } from '../../stores/teamStore'
import { EmptySession } from '../../pages/EmptySession'
import { ActiveSession } from '../../pages/ActiveSession'
import { ScheduledTasks } from '../../pages/ScheduledTasks'
import { Settings } from '../../pages/Settings'
import { AgentTranscript } from '../../pages/AgentTranscript'

export function ContentRouter() {
  const activeTabId = useTabStore((s) => s.activeTabId)
  const activeTabType = useTabStore((s) => s.tabs.find((t) => t.sessionId === s.activeTabId)?.type)
  const viewingAgentId = useTeamStore((s) => s.viewingAgentId)

  // No tabs open — show empty session
  if (!activeTabId || !activeTabType) {
    return <EmptySession />
  }

  // Special tabs
  if (activeTabType === 'settings') {
    return <Settings />
  }

  if (activeTabType === 'scheduled') {
    return <ScheduledTasks />
  }

  // Session tab — show agent transcript or active session
  if (viewingAgentId) {
    return <AgentTranscript />
  }

  return <ActiveSession />
}
