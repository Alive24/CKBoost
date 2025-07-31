// Campaign utility functions
// These work with UI representations of campaigns

/**
 * Calculate days until campaign end date
 * @param endDate - Campaign end date string
 * @returns Number of days remaining (0 if expired)
 */
export function getDaysUntilEnd(endDate: string): number {
  const end = new Date(endDate)
  const now = new Date()
  const diffTime = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return diffDays > 0 ? diffDays : 0
}

/**
 * Get derived status based on end date and current status
 * @param campaign - Campaign object with endDate and status
 * @returns Derived status string
 */
export function getDerivedStatus(campaign: { endDate: string; status: string }): string {
  const daysLeft = getDaysUntilEnd(campaign.endDate)
  if (daysLeft <= 0) return "completed"
  if (daysLeft <= 30) return "ending-soon"
  return campaign.status
}

/**
 * Check if campaign is ending soon
 * @param campaign - Campaign object with endDate and status
 * @returns Boolean indicating if campaign is ending soon
 */
export function isEndingSoon(campaign: { endDate: string; status: string }): boolean {
  return getDerivedStatus(campaign) === "ending-soon"
}

/**
 * Format date for display
 * @param dateString - Date string to format
 * @returns Formatted date string
 */
export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}