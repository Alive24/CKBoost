/**
 * Types for Nostr submission storage format
 */

export interface NostrSubtaskSubmission {
  title: string
  description?: string
  type?: string
  proof_required?: string
  response: string
}

export interface NostrSubmissionData {
  format: 'json'
  version: string
  timestamp: number
  subtasks: NostrSubtaskSubmission[]
}

export interface QuestSubtask {
  title?: string
  description?: string
  type?: string
  proof_required?: string
}

// User submission record from getUserSubmissions
export interface UserSubmissionRecord {
  campaign_type_id: string
  quest_id: number
  submission_timestamp?: number
  submission_content?: string
}

// Type guard to check if parsed JSON is valid NostrSubmissionData
export function isNostrSubmissionData(data: unknown): data is NostrSubmissionData {
  if (!data || typeof data !== 'object') return false
  
  const obj = data as Record<string, unknown>
  
  return (
    obj.format === 'json' &&
    typeof obj.version === 'string' &&
    typeof obj.timestamp === 'number' &&
    Array.isArray(obj.subtasks) &&
    obj.subtasks.every((subtask: unknown) => {
      if (!subtask || typeof subtask !== 'object') return false
      const sub = subtask as Record<string, unknown>
      return (
        typeof sub.title === 'string' &&
        typeof sub.response === 'string' &&
        (sub.description === undefined || typeof sub.description === 'string') &&
        (sub.type === undefined || typeof sub.type === 'string') &&
        (sub.proof_required === undefined || typeof sub.proof_required === 'string')
      )
    })
  )
}