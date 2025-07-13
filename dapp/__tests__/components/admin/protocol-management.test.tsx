/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen } from '@testing-library/react'
import { ProtocolManagement } from '@/components/admin/protocol-management'
import { isProtocolConfigured } from '@/lib/ckb/protocol-deployment'

// Mock the protocol deployment utilities
jest.mock('@/lib/ckb/protocol-deployment', () => ({
  isProtocolConfigured: jest.fn(),
  getProtocolDeploymentTemplate: jest.fn(() => ({
    adminLockHashes: [],
    scriptCodeHashes: {
      ckbBoostProtocolTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostProtocolLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostCampaignTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostCampaignLockCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000",
      ckbBoostUserTypeCodeHash: "0x0000000000000000000000000000000000000000000000000000000000000000"
    },
    tippingConfig: {
      approvalRequirementThresholds: ["10000", "50000", "100000"],
      expirationDuration: 7 * 24 * 60 * 60
    },
    initialEndorsers: []
  })),
  deployProtocolCell: jest.fn(),
  validateDeploymentParams: jest.fn(() => []),
  generateEnvConfig: jest.fn(() => 'Mock env config')
}))

// Mock the protocol provider
jest.mock('@/lib/providers/protocol-provider', () => ({
  useProtocol: jest.fn(() => ({
    protocolData: null,
    metrics: null,
    transactions: [],
    isLoading: false,
    error: null,
    updateProtocolConfig: jest.fn(),
    updateScriptCodeHashes: jest.fn(),
    updateTippingConfig: jest.fn(),
    addEndorser: jest.fn(),
    editEndorser: jest.fn(),
    removeEndorser: jest.fn(),
    batchUpdateProtocol: jest.fn(),
    calculateChanges: jest.fn(() => ({
      protocolConfig: { adminLockHashes: { hasChanged: false, current: [], new: [] } },
      scriptCodeHashes: {},
      tippingConfig: {}
    })),
    refreshProtocolData: jest.fn(),
    isWalletConnected: false
  })),
  useProtocolAdmin: jest.fn()
}))

// Mock CCC
jest.mock('@ckb-ccc/connector-react', () => ({
  ccc: {
    useSigner: jest.fn(() => null),
    Script: {
      from: jest.fn(() => ({
        hash: jest.fn(() => '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef')
      }))
    }
  }
}))

// Mock address utilities
jest.mock('@/lib/utils/address-utils', () => ({
  computeLockHashWithPrefix: jest.fn(() => Promise.resolve('0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'))
}))

const mockIsProtocolConfigured = isProtocolConfigured as jest.MockedFunction<typeof isProtocolConfigured>

describe('ProtocolManagement', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('should show protocol deployment card when protocol is not configured', () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    expect(screen.getByText('Protocol Not Deployed')).toBeInTheDocument()
    expect(screen.getByText('Deploy Protocol Cell')).toBeInTheDocument()
    expect(screen.getByText(/No protocol type script configuration found/)).toBeInTheDocument()
  })

  it('should not show protocol deployment card when protocol is configured', () => {
    mockIsProtocolConfigured.mockReturnValue(true)
    
    render(<ProtocolManagement />)
    
    expect(screen.queryByText('Protocol Not Deployed')).not.toBeInTheDocument()
    expect(screen.queryByText('Deploy Protocol Cell')).not.toBeInTheDocument()
  })

  it('should render without crashing when protocol is not configured', () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    const { container } = render(<ProtocolManagement />)
    
    expect(container).toBeInTheDocument()
    expect(screen.getByText('Protocol Management')).toBeInTheDocument()
  })

  it('should show wallet connection requirement for deployment', () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    expect(screen.getByText(/Connect your wallet to deploy the protocol/)).toBeInTheDocument()
  })
})