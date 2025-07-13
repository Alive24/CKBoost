import {
  isProtocolConfigured,
  getProtocolDeploymentTemplate,
  validateDeploymentParams,
  generateEnvConfig,
  type DeployProtocolCellParams,
  type DeploymentResult
} from '@/lib/ckb/protocol-deployment'

// Mock process.env
const originalEnv = process.env

beforeEach(() => {
  jest.resetModules()
  process.env = { ...originalEnv }
})

afterAll(() => {
  process.env = originalEnv
})

describe('protocol-deployment utilities', () => {
  describe('isProtocolConfigured', () => {
    it('should return false when NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH is not set', () => {
      delete process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH
      
      expect(isProtocolConfigured()).toBe(false)
    })

    it('should return false when NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH is empty string', () => {
      process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH = ''
      
      expect(isProtocolConfigured()).toBe(false)
    })

    it('should return true when NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH is set', () => {
      process.env.NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      
      expect(isProtocolConfigured()).toBe(true)
    })
  })

  describe('getProtocolDeploymentTemplate', () => {
    it('should return a valid deployment template', () => {
      const template = getProtocolDeploymentTemplate()
      
      expect(template).toHaveProperty('adminLockHashes')
      expect(template).toHaveProperty('scriptCodeHashes')
      expect(template).toHaveProperty('tippingConfig')
      expect(template).toHaveProperty('initialEndorsers')
      
      expect(Array.isArray(template.adminLockHashes)).toBe(true)
      expect(Array.isArray(template.initialEndorsers)).toBe(true)
      expect(Array.isArray(template.tippingConfig.approvalRequirementThresholds)).toBe(true)
      
      expect(typeof template.tippingConfig.expirationDuration).toBe('number')
      expect(template.tippingConfig.expirationDuration).toBe(7 * 24 * 60 * 60) // 7 days
    })

    it('should have valid default script code hashes', () => {
      const template = getProtocolDeploymentTemplate()
      
      const scriptHashes = template.scriptCodeHashes
      expect(scriptHashes.ckbBoostProtocolTypeCodeHash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(scriptHashes.ckbBoostProtocolLockCodeHash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(scriptHashes.ckbBoostCampaignTypeCodeHash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(scriptHashes.ckbBoostCampaignLockCodeHash).toMatch(/^0x[0-9a-f]{64}$/i)
      expect(scriptHashes.ckbBoostUserTypeCodeHash).toMatch(/^0x[0-9a-f]{64}$/i)
    })

    it('should have sensible default threshold values', () => {
      const template = getProtocolDeploymentTemplate()
      
      expect(template.tippingConfig.approvalRequirementThresholds).toEqual(["10000", "50000", "100000"])
    })
  })

  describe('validateDeploymentParams', () => {
    const validParams: DeployProtocolCellParams = {
      adminLockHashes: ['0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'],
      scriptCodeHashes: {
        ckbBoostProtocolTypeCodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ckbBoostProtocolLockCodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ckbBoostCampaignTypeCodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ckbBoostCampaignLockCodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
        ckbBoostUserTypeCodeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
      },
      tippingConfig: {
        approvalRequirementThresholds: ['10000', '50000'],
        expirationDuration: 7 * 24 * 60 * 60 // 7 days
      }
    }

    it('should return no errors for valid parameters', () => {
      const errors = validateDeploymentParams(validParams)
      expect(errors).toEqual([])
    })

    it('should require at least one admin lock hash', () => {
      const invalidParams = { ...validParams, adminLockHashes: [] }
      const errors = validateDeploymentParams(invalidParams)
      
      expect(errors).toContain('At least one admin lock hash is required')
    })

    it('should validate admin lock hash format', () => {
      const invalidParams = { 
        ...validParams, 
        adminLockHashes: ['invalid-hash', '0x123'] // too short
      }
      const errors = validateDeploymentParams(invalidParams)
      
      expect(errors).toContain('Admin lock hash 1 is not a valid 32-byte hex string')
      expect(errors).toContain('Admin lock hash 2 is not a valid 32-byte hex string')
    })

    it('should validate script code hash format', () => {
      const invalidParams = { 
        ...validParams,
        scriptCodeHashes: {
          ...validParams.scriptCodeHashes,
          ckbBoostProtocolTypeCodeHash: 'invalid-hash'
        }
      }
      const errors = validateDeploymentParams(invalidParams)
      
      expect(errors).toContain('ckbBoostProtocolTypeCodeHash is not a valid 32-byte hex string')
    })

    it('should require at least one approval threshold', () => {
      const invalidParams = { 
        ...validParams,
        tippingConfig: {
          ...validParams.tippingConfig,
          approvalRequirementThresholds: []
        }
      }
      const errors = validateDeploymentParams(invalidParams)
      
      expect(errors).toContain('At least one approval requirement threshold is required')
    })

    it('should validate approval threshold format', () => {
      const invalidParams = { 
        ...validParams,
        tippingConfig: {
          ...validParams.tippingConfig,
          approvalRequirementThresholds: ['not-a-number', '123.45']
        }
      }
      const errors = validateDeploymentParams(invalidParams)
      
      expect(errors).toContain('Approval threshold 1 must be a valid number')
      expect(errors).toContain('Approval threshold 2 must be a valid number')
    })

    it('should validate expiration duration bounds', () => {
      const tooShort = { 
        ...validParams,
        tippingConfig: { ...validParams.tippingConfig, expirationDuration: 3000 } // < 1 hour
      }
      const tooLong = { 
        ...validParams,
        tippingConfig: { ...validParams.tippingConfig, expirationDuration: 31 * 24 * 60 * 60 } // > 30 days
      }
      
      expect(validateDeploymentParams(tooShort)).toContain('Expiration duration must be at least 1 hour (3600 seconds)')
      expect(validateDeploymentParams(tooLong)).toContain('Expiration duration must be at most 30 days (2592000 seconds)')
    })
  })

  describe('generateEnvConfig', () => {
    it('should generate proper environment configuration', () => {
      const mockResult: DeploymentResult = {
        txHash: '0xabc123',
        protocolTypeScript: {
          codeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          hashType: 'type',
          args: '0xdef456'
        },
        protocolCellOutPoint: {
          txHash: '0xabc123',
          index: 0
        }
      }

      const envConfig = generateEnvConfig(mockResult)

      expect(envConfig).toContain('NEXT_PUBLIC_PROTOCOL_TYPE_CODE_HASH=0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
      expect(envConfig).toContain('NEXT_PUBLIC_PROTOCOL_TYPE_HASH_TYPE=type')
      expect(envConfig).toContain('NEXT_PUBLIC_PROTOCOL_TYPE_ARGS=0xdef456')
      expect(envConfig).toContain('# Transaction: 0xabc123')
      expect(envConfig).toContain('# Cell OutPoint: 0xabc123:0')
    })

    it('should include helpful comments', () => {
      const mockResult: DeploymentResult = {
        txHash: '0xabc123',
        protocolTypeScript: {
          codeHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          hashType: 'type',
          args: '0xdef456'
        },
        protocolCellOutPoint: {
          txHash: '0xabc123',
          index: 0
        }
      }

      const envConfig = generateEnvConfig(mockResult)

      expect(envConfig).toContain('# Generated CKBoost Protocol Configuration')
      expect(envConfig).toContain('# Add these to your .env file')
      expect(envConfig).toContain('# Protocol Cell Information (for reference)')
    })
  })
})