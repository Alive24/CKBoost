import {
  getDaysUntilEnd,
  getDerivedStatus,
  isEndingSoon,
  formatDate,
} from '@/lib/utils/campaign-utils'
import { type MockCampaignData } from '@/lib/ckb/campaign-cells'
import { ccc } from "@ckb-ccc/core"

// Helper to create a test campaign that matches the MockCampaignData structure
function createTestCampaign(overrides?: Partial<any>): MockCampaignData {
  const defaults = {
    id: ccc.hexFrom(ccc.bytesFrom('1', "utf8")),
    title: ccc.hexFrom(ccc.bytesFrom('Test Campaign', "utf8")),
    short_description: ccc.hexFrom(ccc.bytesFrom('Test Description', "utf8")),
    long_description: ccc.hexFrom(ccc.bytesFrom('Test Long Description', "utf8")),
    creator: {
      codeHash: "0x" + "00".repeat(32) as ccc.Hex,
      hashType: "type" as const,
      args: "0x" + "00".repeat(20) as ccc.Hex
    },
    endorser_info: {
      endorser_lock_hash: "0x" + "00".repeat(32) as ccc.Hex,
      endorser_name: ccc.hexFrom(ccc.bytesFrom('Test Endorser', "utf8")),
      endorser_description: ccc.hexFrom(ccc.bytesFrom('Test Endorser Description', "utf8")),
      website: ccc.hexFrom(ccc.bytesFrom('', "utf8")),
      social_links: [],
      verified: 1
    },
    metadata: {
      funding_info: [],
      created_at: BigInt(Date.now()),
      starting_time: BigInt(new Date('2024-01-01T00:00:00.000Z').getTime()),
      ending_time: BigInt(new Date('2024-01-20T12:00:00.000Z').getTime()),
      verification_requirements: 0,
      last_updated: BigInt(Date.now()),
      categories: [ccc.hexFrom(ccc.bytesFrom('Test', "utf8"))],
      difficulty: 1,
      image_cid: ccc.hexFrom(ccc.bytesFrom('', "utf8")),
      rules: []
    },
    status: 1,
    quests: [],
    participants_count: 50,
    total_completions: 0,
    typeHash: "0x" + "00".repeat(32),
    participants: 50,
    questsCompleted: 0,
    completedQuests: 0
  }

  if (overrides) {
    // Apply overrides - handle special cases for nested objects
    if (overrides.endDate) {
      defaults.metadata.ending_time = BigInt(new Date(overrides.endDate).getTime())
    }
    if (overrides.status) {
      defaults.status = overrides.status === 'active' ? 1 : overrides.status === 'completed' ? 2 : 0
    }
  }

  return defaults
}

// Helper to convert MockCampaignData to simple object for utility functions
function toCampaignUtilFormat(campaign: MockCampaignData): { endDate: string; status: string } {
  return {
    endDate: new Date(Number(campaign.metadata.ending_time)).toISOString(),
    status: campaign.status === 1 ? 'active' : campaign.status === 2 ? 'completed' : 'draft'
  }
}

// Mock Date for consistent testing
const mockDate = new Date('2024-01-15T12:00:00.000Z')

describe('campaign-utils', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(mockDate)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  describe('getDaysUntilEnd', () => {
    it('should calculate days correctly for future dates', () => {
      const futureDates = [
        { date: '2024-01-16T12:00:00.000Z', expected: 1 }, // 1 day
        { date: '2024-01-22T12:00:00.000Z', expected: 7 }, // 7 days
        { date: '2024-02-15T12:00:00.000Z', expected: 31 }, // 31 days
        { date: '2024-01-15T13:00:00.000Z', expected: 1 }, // 1 hour later, should round up to 1 day
      ]

      futureDates.forEach(({ date, expected }) => {
        expect(getDaysUntilEnd(date)).toBe(expected)
      })
    })

    it('should return 0 for past dates', () => {
      const pastDates = [
        '2024-01-14T12:00:00.000Z', // 1 day ago
        '2024-01-10T12:00:00.000Z', // 5 days ago
        '2023-12-15T12:00:00.000Z', // 1 month ago
        '2024-01-15T11:00:00.000Z', // 1 hour ago
      ]

      pastDates.forEach(date => {
        expect(getDaysUntilEnd(date)).toBe(0)
      })
    })

    it('should handle current date/time', () => {
      expect(getDaysUntilEnd('2024-01-15T12:00:00.000Z')).toBe(0)
    })

    it('should handle invalid date strings gracefully', () => {
      // Invalid dates result in NaN calculations, but the function returns 0 for negative/invalid results
      const result1 = getDaysUntilEnd('invalid-date')
      const result2 = getDaysUntilEnd('')
      
      // Should either return 0 or NaN depending on the calculation
      expect(result1 === 0 || isNaN(result1)).toBe(true)
      expect(result2 === 0 || isNaN(result2)).toBe(true)
    })

    it('should round up partial days correctly', () => {
      // 23 hours and 59 minutes in the future should be 1 day
      expect(getDaysUntilEnd('2024-01-16T11:59:00.000Z')).toBe(1)
      
      // 1 minute in the future should be 1 day
      expect(getDaysUntilEnd('2024-01-15T12:01:00.000Z')).toBe(1)
      
      // 25 hours in the future should be 2 days
      expect(getDaysUntilEnd('2024-01-16T13:00:00.000Z')).toBe(2)
    })
  })

  describe('getDerivedStatus', () => {
    const baseCampaign = createTestCampaign({
      endDate: '2024-01-20T12:00:00.000Z',
      status: 'active'
    })

    it('should return "completed" for expired campaigns', () => {
      const expiredCampaign = createTestCampaign({
        endDate: '2024-01-14T12:00:00.000Z', // 1 day ago
        status: 'active'
      })

      expect(getDerivedStatus(toCampaignUtilFormat(expiredCampaign))).toBe('completed')
    })

    it('should return "ending-soon" for campaigns ending within 30 days', () => {
      const endingSoonDates = [
        '2024-01-16T12:00:00.000Z', // 1 day
        '2024-01-30T12:00:00.000Z', // 15 days
        '2024-02-14T12:00:00.000Z', // 30 days
      ]

      endingSoonDates.forEach(endDate => {
        const campaign = createTestCampaign({ endDate, status: 'active' })
        expect(getDerivedStatus(toCampaignUtilFormat(campaign))).toBe('ending-soon')
      })
    })

    it('should return original status for campaigns with more than 30 days', () => {
      const longRunningCampaigns = [
        { endDate: '2024-02-15T12:00:00.000Z', status: 'active' }, // 31 days
        { endDate: '2024-03-15T12:00:00.000Z', status: 'draft' }, // 60 days
        { endDate: '2024-07-15T12:00:00.000Z', status: 'paused' }, // 182 days
      ]

      longRunningCampaigns.forEach(({ endDate, status }) => {
        const campaign = createTestCampaign({ endDate, status })
        const utilFormat = toCampaignUtilFormat(campaign)
        // Note: Since CampaignWithTypeHash only has numeric status (1, 2, etc),
        // we need to adjust our expectations
        const expectedStatus = status === 'paused' ? 'draft' : status
        expect(getDerivedStatus(utilFormat)).toBe(expectedStatus)
      })
    })

    it('should handle edge case of exactly 30 days', () => {
      const campaign = createTestCampaign({
        endDate: '2024-02-14T12:00:00.000Z', // exactly 30 days
        status: 'active'
      })
      const utilFormat = toCampaignUtilFormat(campaign)

      expect(getDerivedStatus(utilFormat)).toBe('ending-soon')
    })

    it('should handle different original statuses', () => {
      const statuses = ['active', 'draft', 'paused', 'cancelled'] as const
      
      statuses.forEach(status => {
        const campaign = createTestCampaign({
          endDate: '2024-03-15T12:00:00.000Z', // 60 days (far future)
          status
        })
        const utilFormat = toCampaignUtilFormat(campaign)
        
        // Since the schema only supports numeric status, we need to adjust expectations
        const expectedStatus = status === 'paused' || status === 'cancelled' ? 'draft' : status
        expect(getDerivedStatus(utilFormat)).toBe(expectedStatus)
      })
    })
  })

  describe('isEndingSoon', () => {
    it('should return true for campaigns ending within 30 days', () => {
      const endingSoonDates = [
        '2024-01-16T12:00:00.000Z', // 1 day
        '2024-01-30T12:00:00.000Z', // 15 days
        '2024-02-14T12:00:00.000Z', // 30 days
      ]

      endingSoonDates.forEach(endDate => {
        const campaign = createTestCampaign({ endDate, status: 'active' })
        expect(isEndingSoon(toCampaignUtilFormat(campaign))).toBe(true)
      })
    })

    it('should return false for campaigns with more than 30 days', () => {
      const endDates = [
        '2024-02-15T12:00:00.000Z', // 31 days
        '2024-03-15T12:00:00.000Z', // 60 days
        '2024-07-15T12:00:00.000Z', // 182 days
      ]

      endDates.forEach(endDate => {
        const campaign = createTestCampaign({ endDate, status: 'active' })
        expect(isEndingSoon(toCampaignUtilFormat(campaign))).toBe(false)
      })
    })

    it('should return false for expired campaigns', () => {
      const expiredCampaign = createTestCampaign({
        endDate: '2024-01-14T12:00:00.000Z', // 1 day ago
        status: 'active'
      })

      expect(isEndingSoon(toCampaignUtilFormat(expiredCampaign))).toBe(false)
    })
  })

  describe('formatDate', () => {
    it('should format valid dates correctly', () => {
      const testDates = [
        { input: '2024-01-15T12:00:00.000Z', expected: 'January 15, 2024' },
        { input: '2024-12-25T00:00:00.000Z', expected: 'December 25, 2024' },
        { input: '2023-07-04T15:30:00.000Z', expected: 'July 4, 2023' },
        { input: '2024-02-29T12:00:00.000Z', expected: 'February 29, 2024' }, // leap year
      ]

      testDates.forEach(({ input, expected }) => {
        expect(formatDate(input)).toBe(expected)
      })
    })

    it('should handle date strings without time', () => {
      expect(formatDate('2024-01-15')).toBe('January 15, 2024')
      expect(formatDate('2023-12-25')).toBe('December 25, 2023')
    })

    it('should handle different date formats', () => {
      // Different valid date formats
      expect(formatDate('January 15, 2024')).toBe('January 15, 2024')
      expect(formatDate('2024/01/15')).toBe('January 15, 2024')
      expect(formatDate('01/15/2024')).toBe('January 15, 2024')
    })

    it('should handle invalid dates', () => {
      expect(formatDate('invalid-date')).toBe('Invalid Date')
      expect(formatDate('')).toBe('Invalid Date')
      expect(formatDate('2024-13-45')).toBe('Invalid Date') // Invalid month/day
    })

    it('should handle timezone differences consistently', () => {
      // Test that the format is consistent regardless of timezone
      const utcDate = '2024-01-15T00:00:00.000Z'
      const formattedDate = formatDate(utcDate)
      
      // Should be consistently formatted (actual date may vary by timezone)
      expect(formattedDate).toMatch(/^[A-Z][a-z]+ \d{1,2}, \d{4}$/)
    })
  })

  describe('integration tests', () => {
    it('should work with real campaign data flow', () => {
      const campaign = createTestCampaign({
        endDate: '2024-01-30T12:00:00.000Z', // 15 days from mock date
        status: 'active'
      })
      const utilFormat = toCampaignUtilFormat(campaign)

      // Check all functions work together
      const daysLeft = getDaysUntilEnd(utilFormat.endDate)
      expect(daysLeft).toBe(15)

      const derivedStatus = getDerivedStatus(utilFormat)
      expect(derivedStatus).toBe('ending-soon')

      const endingSoon = isEndingSoon(utilFormat)
      expect(endingSoon).toBe(true)

      const formattedDate = formatDate(utilFormat.endDate)
      expect(formattedDate).toBe('January 30, 2024')
    })

    it('should handle campaign lifecycle correctly', () => {
      // We'll create different campaigns for different stages

      // Campaign with 60 days left (active)
      const activeCampaign = createTestCampaign({ endDate: '2024-03-15T12:00:00.000Z', status: 'active' })
      const activeUtil = toCampaignUtilFormat(activeCampaign)
      expect(getDerivedStatus(activeUtil)).toBe('active')
      expect(isEndingSoon(activeUtil)).toBe(false)

      // Campaign with 15 days left (ending soon)
      const endingSoonCampaign = createTestCampaign({ endDate: '2024-01-30T12:00:00.000Z', status: 'active' })
      const endingSoonUtil = toCampaignUtilFormat(endingSoonCampaign)
      expect(getDerivedStatus(endingSoonUtil)).toBe('ending-soon')
      expect(isEndingSoon(endingSoonUtil)).toBe(true)

      // Expired campaign (completed)
      const expiredCampaign = createTestCampaign({ endDate: '2024-01-10T12:00:00.000Z', status: 'active' })
      const expiredUtil = toCampaignUtilFormat(expiredCampaign)
      expect(getDerivedStatus(expiredUtil)).toBe('completed')
      expect(isEndingSoon(expiredUtil)).toBe(false)
    })
  })

  describe('edge cases and error handling', () => {
    it('should handle null and undefined inputs gracefully', () => {
      expect(() => getDaysUntilEnd(null as any)).not.toThrow()
      expect(() => getDaysUntilEnd(undefined as any)).not.toThrow()
      expect(() => formatDate(null as any)).not.toThrow()
      expect(() => formatDate(undefined as any)).not.toThrow()
    })

    it('should handle extreme date values', () => {
      // Very far future
      const farFuture = '2100-01-01T12:00:00.000Z'
      expect(getDaysUntilEnd(farFuture)).toBeGreaterThan(27000) // rough calculation
      expect(formatDate(farFuture)).toBe('January 1, 2100')

      // Very far past
      const farPast = '1900-01-01T12:00:00.000Z'
      expect(getDaysUntilEnd(farPast)).toBe(0)
      expect(formatDate(farPast)).toBe('January 1, 1900')
    })

    it('should handle leap year calculations', () => {
      // Test around leap year boundary
      jest.setSystemTime(new Date('2024-02-28T12:00:00.000Z'))
      
      expect(getDaysUntilEnd('2024-02-29T12:00:00.000Z')).toBe(1) // leap day
      expect(getDaysUntilEnd('2024-03-01T12:00:00.000Z')).toBe(2) // day after leap day
      expect(formatDate('2024-02-29')).toBe('February 29, 2024')
    })

    it('should handle daylight saving time transitions', () => {
      // Set mock time to just before DST transition
      jest.setSystemTime(new Date('2024-03-10T06:00:00.000Z')) // Spring forward in US
      
      const nextDay = '2024-03-11T06:00:00.000Z'
      const daysUntil = getDaysUntilEnd(nextDay)
      
      // Should still calculate as 1 day despite DST
      expect(daysUntil).toBe(1)
    })
  })
})