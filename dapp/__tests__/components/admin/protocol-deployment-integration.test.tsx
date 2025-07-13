/**
 * @jest-environment jsdom
 */

import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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

// Mock the protocol provider with wallet connected
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
    isWalletConnected: true // Wallet is connected
  })),
  useProtocolAdmin: jest.fn()
}))

import { useProtocol } from '@/lib/providers/protocol-provider'
const mockUseProtocol = useProtocol as jest.MockedFunction<typeof useProtocol>

// Mock CCC with signer
const mockSigner = {
  getRecommendedAddress: jest.fn(() => Promise.resolve('ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq9zuyhnp0wmjejcpznmn7srdduvxa5r4xgr7wmxq'))
}

jest.mock('@ckb-ccc/connector-react', () => ({
  ccc: {
    useSigner: jest.fn(() => mockSigner),
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

describe('Protocol Deployment Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset the mock to default state
    mockUseProtocol.mockImplementation(() => ({
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
      isWalletConnected: true // Wallet is connected by default
    }))
  })

  it('should show deployment dialog when deploy button is clicked', async () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    // Should show the deployment card
    expect(screen.getByText('Protocol Not Deployed')).toBeInTheDocument()
    
    // Click the deploy button (the one in the card, not the dialog title)
    const deployButton = screen.getByRole('button', { name: /Deploy Protocol Cell/ })
    fireEvent.click(deployButton)
    
    // Should show the deployment dialog
    await waitFor(() => {
      expect(screen.getByText('Admin Configuration')).toBeInTheDocument()
      expect(screen.getByText('Script Code Hashes')).toBeInTheDocument()
      expect(screen.getByText('Tipping Configuration')).toBeInTheDocument()
    })
  })

  it('should initialize deployment form with user lock hash when wallet is connected', async () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    // Click the deploy button
    const deployButton = screen.getByRole('button', { name: /Deploy Protocol Cell/ })
    fireEvent.click(deployButton)
    
    // Wait for the form to be initialized
    await waitFor(() => {
      expect(mockSigner.getRecommendedAddress).toHaveBeenCalled()
    })
    
    // Should show form fields
    expect(screen.getByLabelText('Admin Lock Hashes')).toBeInTheDocument()
    expect(screen.getByLabelText('Protocol Type Code Hash')).toBeInTheDocument()
    expect(screen.getByLabelText('Approval Thresholds (Shannons)')).toBeInTheDocument()
    expect(screen.getByLabelText('Expiration Duration (seconds)')).toBeInTheDocument()
  })

  it('should show deploy button as enabled when wallet is connected', () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    const deployButton = screen.getByRole('button', { name: /Deploy Protocol Cell/ })
    expect(deployButton).not.toBeDisabled()
  })

  it('should show deploy button as disabled when wallet is not connected', () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    // Mock wallet as disconnected
    mockUseProtocol.mockReturnValue({
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
      isWalletConnected: false // Wallet is disconnected
    })
    
    render(<ProtocolManagement />)
    
    const deployButton = screen.getByRole('button', { name: /Deploy Protocol Cell/ })
    expect(deployButton).toBeDisabled()
    expect(screen.getByText(/Connect your wallet to deploy the protocol/)).toBeInTheDocument()
  })

  it('should close deployment dialog when cancel is clicked', async () => {
    mockIsProtocolConfigured.mockReturnValue(false)
    
    render(<ProtocolManagement />)
    
    // Open the dialog
    const deployButton = screen.getByRole('button', { name: /Deploy Protocol Cell/ })
    fireEvent.click(deployButton)
    
    // Should show the dialog
    await waitFor(() => {
      expect(screen.getByText('Admin Configuration')).toBeInTheDocument()
    })
    
    // Click cancel
    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)
    
    // Dialog should be closed
    await waitFor(() => {
      expect(screen.queryByText('Admin Configuration')).not.toBeInTheDocument()
    })
  })
})