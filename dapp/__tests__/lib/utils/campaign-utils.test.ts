import {
  getDaysUntilEnd,
  getDerivedStatus,
  isEndingSoon,
  formatDate,
} from '@/lib/utils/campaign-utils'
import { Campaign } from '@/lib/types/campaign'

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
    const baseCampaign: Campaign = {
      id: 1,
      title: 'Test Campaign',
      description: 'Test Description',
      creator: 'Test Creator',
      endDate: '2024-01-20T12:00:00.000Z',
      status: 'active',
      totalReward: 1000,
      participants: 50,
      verificationRequired: false,
      featured: false
    }

    it('should return "completed" for expired campaigns', () => {
      const expiredCampaign = {
        ...baseCampaign,
        endDate: '2024-01-14T12:00:00.000Z', // 1 day ago
        status: 'active' as const
      }

      expect(getDerivedStatus(expiredCampaign)).toBe('completed')
    })

    it('should return "ending-soon" for campaigns ending within 30 days', () => {
      const endingSoonCampaigns = [
        { ...baseCampaign, endDate: '2024-01-16T12:00:00.000Z' }, // 1 day
        { ...baseCampaign, endDate: '2024-01-30T12:00:00.000Z' }, // 15 days
        { ...baseCampaign, endDate: '2024-02-14T12:00:00.000Z' }, // 30 days
      ]

      endingSoonCampaigns.forEach(campaign => {
        expect(getDerivedStatus(campaign)).toBe('ending-soon')
      })
    })

    it('should return original status for campaigns with more than 30 days', () => {
      const longRunningCampaigns = [
        { ...baseCampaign, endDate: '2024-02-15T12:00:00.000Z', status: 'active' as const }, // 31 days
        { ...baseCampaign, endDate: '2024-03-15T12:00:00.000Z', status: 'draft' as const }, // 60 days
        { ...baseCampaign, endDate: '2024-07-15T12:00:00.000Z', status: 'paused' as const }, // 182 days
      ]

      longRunningCampaigns.forEach(campaign => {
        expect(getDerivedStatus(campaign)).toBe(campaign.status)
      })
    })

    it('should handle edge case of exactly 30 days', () => {
      const exactlyThirtyDays = {
        ...baseCampaign,
        endDate: '2024-02-14T12:00:00.000Z', // exactly 30 days
        status: 'active' as const
      }

      expect(getDerivedStatus(exactlyThirtyDays)).toBe('ending-soon')
    })

    it('should handle different original statuses', () => {
      const statuses = ['active', 'draft', 'paused', 'cancelled'] as const
      
      statuses.forEach(status => {
        const campaign = {
          ...baseCampaign,
          endDate: '2024-03-15T12:00:00.000Z', // 60 days (far future)
          status
        }
        
        expect(getDerivedStatus(campaign)).toBe(status)
      })
    })
  })

  describe('isEndingSoon', () => {
    const baseCampaign: Campaign = {
      id: 1,
      title: 'Test Campaign',
      description: 'Test Description',
      creator: 'Test Creator',
      endDate: '2024-01-20T12:00:00.000Z',
      status: 'active',
      totalReward: 1000,
      participants: 50,
      verificationRequired: false,
      featured: false
    }

    it('should return true for campaigns ending within 30 days', () => {
      const endingSoonCampaigns = [
        { ...baseCampaign, endDate: '2024-01-16T12:00:00.000Z' }, // 1 day
        { ...baseCampaign, endDate: '2024-01-30T12:00:00.000Z' }, // 15 days
        { ...baseCampaign, endDate: '2024-02-14T12:00:00.000Z' }, // 30 days
      ]

      endingSoonCampaigns.forEach(campaign => {
        expect(isEndingSoon(campaign)).toBe(true)
      })
    })

    it('should return false for campaigns with more than 30 days', () => {
      const notEndingSoonCampaigns = [
        { ...baseCampaign, endDate: '2024-02-15T12:00:00.000Z' }, // 31 days
        { ...baseCampaign, endDate: '2024-03-15T12:00:00.000Z' }, // 60 days
        { ...baseCampaign, endDate: '2024-07-15T12:00:00.000Z' }, // 182 days
      ]

      notEndingSoonCampaigns.forEach(campaign => {
        expect(isEndingSoon(campaign)).toBe(false)
      })
    })

    it('should return false for expired campaigns', () => {
      const expiredCampaign = {
        ...baseCampaign,
        endDate: '2024-01-14T12:00:00.000Z' // 1 day ago
      }

      expect(isEndingSoon(expiredCampaign)).toBe(false)
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
      const campaign: Campaign = {
        id: 1,
        title: 'Real Campaign Test',
        description: 'Testing with realistic data',
        creator: 'Test Creator',
        endDate: '2024-01-30T12:00:00.000Z', // 15 days from mock date
        status: 'active',
        totalReward: 5000,
        participants: 125,
        verificationRequired: true,
        featured: true
      }

      // Check all functions work together
      const daysLeft = getDaysUntilEnd(campaign.endDate)
      expect(daysLeft).toBe(15)

      const derivedStatus = getDerivedStatus(campaign)
      expect(derivedStatus).toBe('ending-soon')

      const endingSoon = isEndingSoon(campaign)
      expect(endingSoon).toBe(true)

      const formattedDate = formatDate(campaign.endDate)
      expect(formattedDate).toBe('January 30, 2024')
    })

    it('should handle campaign lifecycle correctly', () => {
      const baseCampaign: Campaign = {
        id: 1,
        title: 'Lifecycle Test',
        description: 'Testing campaign lifecycle',
        creator: 'Test Creator',
        endDate: '',
        status: 'active',
        totalReward: 1000,
        participants: 50,
        verificationRequired: false,
        featured: false
      }

      // Campaign with 60 days left (active)
      const activeCampaign = { ...baseCampaign, endDate: '2024-03-15T12:00:00.000Z' }
      expect(getDerivedStatus(activeCampaign)).toBe('active')
      expect(isEndingSoon(activeCampaign)).toBe(false)

      // Campaign with 15 days left (ending soon)
      const endingSoonCampaign = { ...baseCampaign, endDate: '2024-01-30T12:00:00.000Z' }
      expect(getDerivedStatus(endingSoonCampaign)).toBe('ending-soon')
      expect(isEndingSoon(endingSoonCampaign)).toBe(true)

      // Expired campaign (completed)
      const expiredCampaign = { ...baseCampaign, endDate: '2024-01-10T12:00:00.000Z' }
      expect(getDerivedStatus(expiredCampaign)).toBe('completed')
      expect(isEndingSoon(expiredCampaign)).toBe(false)
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