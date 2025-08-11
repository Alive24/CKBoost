// Debug utility that respects production mode
const isDevelopment = process.env.NODE_ENV !== 'production'
const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true'

export const debug = {
  log: (...args: unknown[]) => {
    if (isDevelopment || debugEnabled) {
      console.log('[CKBoost Debug]', ...args)
    }
  },
  
  error: (...args: unknown[]) => {
    if (isDevelopment || debugEnabled) {
      console.error('[CKBoost Error]', ...args)
    }
  },
  
  warn: (...args: unknown[]) => {
    if (isDevelopment || debugEnabled) {
      console.warn('[CKBoost Warning]', ...args)
    }
  },
  
  info: (...args: unknown[]) => {
    if (isDevelopment || debugEnabled) {
      console.info('[CKBoost Info]', ...args)
    }
  },
  
  table: (data: unknown) => {
    if (isDevelopment || debugEnabled) {
      console.table(data)
    }
  },
  
  group: (label: string) => {
    if (isDevelopment || debugEnabled) {
      console.group(`[CKBoost] ${label}`)
    }
  },
  
  groupEnd: () => {
    if (isDevelopment || debugEnabled) {
      console.groupEnd()
    }
  },
  
  time: (label: string) => {
    if (isDevelopment || debugEnabled) {
      console.time(`[CKBoost] ${label}`)
    }
  },
  
  timeEnd: (label: string) => {
    if (isDevelopment || debugEnabled) {
      console.timeEnd(`[CKBoost] ${label}`)
    }
  }
}

// Export a formatted date function that's consistent between server and client
export const formatDateConsistent = (dateString: string | Date): string => {
  const date = typeof dateString === 'string' ? new Date(dateString) : dateString
  
  // Use a consistent format that doesn't depend on locale
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  const year = date.getFullYear()
  
  return `${month}/${day}/${year}`
}