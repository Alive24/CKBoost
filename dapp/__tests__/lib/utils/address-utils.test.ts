import {
  computeLockHashFromAddress,
  computeLockHashWithPrefix,
  validateCKBAddress,
  formatAddressForDisplay,
} from '@/lib/utils/address-utils'
import { ccc } from '@ckb-ccc/connector-react'

// Mock the CCC library
jest.mock('@ckb-ccc/connector-react')

const mockCCC = ccc as jest.Mocked<typeof ccc>

describe('address-utils', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe('computeLockHashFromAddress', () => {
    const testAddress = 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq'
    const expectedHash = '608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a'

    it('should compute lock hash from valid testnet address', async () => {
      // Mock the CCC library implementation
      const mockScript = {
        hash: jest.fn().mockReturnValue(`0x${expectedHash}`)
      }
      
      const mockAddress = {
        script: mockScript
      }

      mockCCC.Address.fromString = jest.fn().mockResolvedValue(mockAddress)
      mockCCC.ClientPublicTestnet = jest.fn()

      const result = await computeLockHashFromAddress(testAddress)

      expect(result).toBe(expectedHash)
      expect(mockCCC.Address.fromString).toHaveBeenCalledWith(
        testAddress,
        expect.any(Object)
      )
      expect(mockScript.hash).toHaveBeenCalled()
    })

    it('should compute lock hash from valid mainnet address', async () => {
      const mainnetAddress = 'ckb1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt'
      const expectedMainnetHash = 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0'

      const mockScript = {
        hash: jest.fn().mockReturnValue(`0x${expectedMainnetHash}`)
      }
      
      const mockAddress = {
        script: mockScript
      }

      mockCCC.Address.fromString = jest.fn().mockResolvedValue(mockAddress)

      const result = await computeLockHashFromAddress(mainnetAddress)

      expect(result).toBe(expectedMainnetHash)
    })

    it('should throw error for invalid address', async () => {
      const invalidAddress = 'invalid-address'

      mockCCC.Address.fromString = jest.fn().mockRejectedValue(new Error('Invalid address'))

      await expect(computeLockHashFromAddress(invalidAddress)).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
    })

    it('should throw error for empty address', async () => {
      await expect(computeLockHashFromAddress('')).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
    })

    it('should throw error for null/undefined address', async () => {
      await expect(computeLockHashFromAddress(null as any)).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
      
      await expect(computeLockHashFromAddress(undefined as any)).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
    })

    it('should handle network errors gracefully', async () => {
      mockCCC.Address.fromString = jest.fn().mockRejectedValue(new Error('Network error'))

      await expect(computeLockHashFromAddress(testAddress)).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
    })
  })

  describe('computeLockHashWithPrefix', () => {
    const testAddress = 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq'
    const expectedHash = '608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a'

    it('should return lock hash with 0x prefix', async () => {
      const mockScript = {
        hash: jest.fn().mockReturnValue(`0x${expectedHash}`)
      }
      
      const mockAddress = {
        script: mockScript
      }

      mockCCC.Address.fromString = jest.fn().mockResolvedValue(mockAddress)

      const result = await computeLockHashWithPrefix(testAddress)

      expect(result).toBe(`0x${expectedHash}`)
      expect(result.startsWith('0x')).toBe(true)
      expect(result.length).toBe(66) // 0x + 64 characters
    })

    it('should handle errors from computeLockHashFromAddress', async () => {
      mockCCC.Address.fromString = jest.fn().mockRejectedValue(new Error('Invalid address'))

      await expect(computeLockHashWithPrefix('invalid')).rejects.toThrow(
        'Invalid CKB address or failed to compute lock hash'
      )
    })
  })

  describe('validateCKBAddress', () => {
    it('should validate correct testnet addresses', () => {
      const validTestnetAddresses = [
        'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq',
        'ckt1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt',
        'ckt1qyq5lv479ewscx3ms620sv34pgeuz6zagaaqklhtgg2snt'
      ]

      validTestnetAddresses.forEach(address => {
        expect(validateCKBAddress(address)).toBe(true)
      })
    })

    it('should validate correct mainnet addresses', () => {
      const validMainnetAddresses = [
        'ckb1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt',
        'ckb1qyq5lv479ewscx3ms620sv34pgeuz6zagaaqklhtgg2snt'
      ]

      validMainnetAddresses.forEach(address => {
        expect(validateCKBAddress(address)).toBe(true)
      })
    })

    it('should reject invalid addresses', () => {
      const invalidAddresses = [
        '',
        null,
        undefined,
        'invalid-address',
        'btc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        'eth0x742d35Cc6634C0532925a3b8D29060B7DD',
        'ckb1', // too short
        'ckt1', // too short
        'abc1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt', // wrong prefix
        123, // wrong type
        {}, // wrong type
      ]

      invalidAddresses.forEach(address => {
        expect(validateCKBAddress(address as any)).toBe(false)
      })
    })

    it('should handle edge cases', () => {
      // Test minimum length boundary
      expect(validateCKBAddress('ckb1' + 'a'.repeat(38))).toBe(true) // exactly 42 chars
      expect(validateCKBAddress('ckb1' + 'a'.repeat(37))).toBe(false) // 41 chars (too short)
      
      // Test non-string inputs
      expect(validateCKBAddress(null as any)).toBe(false)
      expect(validateCKBAddress(undefined as any)).toBe(false)
      expect(validateCKBAddress(123 as any)).toBe(false)
      expect(validateCKBAddress({} as any)).toBe(false)
      expect(validateCKBAddress([] as any)).toBe(false)
    })
  })

  describe('formatAddressForDisplay', () => {
    it('should format long addresses correctly', () => {
      const longAddress = 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq'
      const result = formatAddressForDisplay(longAddress)
      
      expect(result).toBe('ckt1qr...wmxq')
      expect(result.includes('...')).toBe(true)
      expect(result.length).toBe(13) // 6 + 3 + 4 = 13 chars
    })

    it('should format medium addresses correctly', () => {
      const mediumAddress = 'ckb1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt'
      const result = formatAddressForDisplay(mediumAddress)
      
      expect(result).toBe('ckb1qy...2snt')
      expect(result.includes('...')).toBe(true)
    })

    it('should return short addresses unchanged', () => {
      const shortAddresses = [
        'ckb1test',
        'short',
        'abc',
        'ckt1qr'
      ]

      shortAddresses.forEach(address => {
        expect(formatAddressForDisplay(address)).toBe(address)
      })
    })

    it('should handle edge cases', () => {
      expect(formatAddressForDisplay('')).toBe('')
      expect(formatAddressForDisplay(null as any)).toBe(null)
      expect(formatAddressForDisplay(undefined as any)).toBe(undefined)
    })

    it('should handle exactly 10 character addresses', () => {
      const tenCharAddress = '1234567890'
      const result = formatAddressForDisplay(tenCharAddress)
      
      // Should be formatted since it's exactly 10 chars and >= 10
      expect(result).toBe('123456...7890')
    })
  })

  describe('integration tests', () => {
    it('should work with real-world testnet address flow', async () => {
      const testAddress = 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq'
      
      // Validate the address
      expect(validateCKBAddress(testAddress)).toBe(true)
      
      // Format for display
      const displayAddress = formatAddressForDisplay(testAddress)
      expect(displayAddress).toBe('ckt1qr...wmxq')
      
      // Mock successful hash computation
      const mockScript = {
        hash: jest.fn().mockReturnValue('0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a')
      }
      
      const mockAddress = {
        script: mockScript
      }

      mockCCC.Address.fromString = jest.fn().mockResolvedValue(mockAddress)
      
      // Compute hash
      const hash = await computeLockHashFromAddress(testAddress)
      expect(hash).toBe('608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a')
      
      // Compute hash with prefix
      const hashWithPrefix = await computeLockHashWithPrefix(testAddress)
      expect(hashWithPrefix).toBe('0x608e6846ba5e83c969aa93349551db03fd450b92dfd6e1ed55970fa5f4635b6a')
    })

    it('should handle error flow gracefully', async () => {
      const invalidAddress = 'invalid-address-format'
      
      // Should fail validation
      expect(validateCKBAddress(invalidAddress)).toBe(false)
      
      // Should still format for display (even if invalid)
      const displayAddress = formatAddressForDisplay(invalidAddress)
      expect(displayAddress).toBe('invali...rmat')
      
      // Should throw when trying to compute hash
      mockCCC.Address.fromString = jest.fn().mockRejectedValue(new Error('Invalid address'))
      
      await expect(computeLockHashFromAddress(invalidAddress)).rejects.toThrow()
      await expect(computeLockHashWithPrefix(invalidAddress)).rejects.toThrow()
    })
  })

  describe('performance and edge cases', () => {
    it('should handle very long addresses', () => {
      const veryLongAddress = 'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq' + 'a'.repeat(1000)
      
      expect(validateCKBAddress(veryLongAddress)).toBe(true)
      
      const formatted = formatAddressForDisplay(veryLongAddress)
      expect(formatted).toBe('ckt1qr...aaaa')
      expect(formatted.length).toBe(13)
    })

    it('should handle concurrent hash computations', async () => {
      const addresses = [
        'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq',
        'ckt1qyqr79tnk3pp34xkx2c9w7qzfn8n26k48ugqvswasg2snt',
        'ckt1qyq5lv479ewscx3ms620sv34pgeuz6zagaaqklhtgg2snt'
      ]

      // Mock different hashes for each address
      let callCount = 0
      mockCCC.Address.fromString = jest.fn().mockImplementation(() => {
        callCount++
        const hash = `0x${'a'.repeat(63-callCount.toString().length)}${callCount}`
        return Promise.resolve({
          script: {
            hash: () => hash
          }
        })
      })

      const promises = addresses.map(addr => computeLockHashFromAddress(addr))
      const results = await Promise.all(promises)

      expect(results).toHaveLength(3)
      expect(results[0]).toContain('1')
      expect(results[1]).toContain('2') 
      expect(results[2]).toContain('3')
      
      // All results should be different
      expect(new Set(results).size).toBe(3)
    })
  })
})