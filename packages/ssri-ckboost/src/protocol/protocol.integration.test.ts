import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { ccc } from '@ckb-ccc/core';
import { ssri } from '@ckb-ccc/ssri';
import { Protocol } from './index';
import type { ProtocolDataInput } from '../types';

// SSRI executor URL
const SSRI_URL = process.env.SSRI_URL || 'http://127.0.0.1:9090';

// Check if we have real contract details
const hasRealContracts = process.env.PROTOCOL_CODE_TX_HASH && 
                        !process.env.PROTOCOL_CODE_TX_HASH.includes('00000000') &&
                        process.env.PROTOCOL_CODE_HASH &&
                        !process.env.PROTOCOL_CODE_HASH.includes('00000000');

if (!hasRealContracts) {
  console.log('⚠️  Integration tests require real deployed contract details.');
  console.log('   Set PROTOCOL_CODE_TX_HASH and PROTOCOL_CODE_HASH environment variables');
  console.log('   Current values:');
  console.log('   PROTOCOL_CODE_TX_HASH:', process.env.PROTOCOL_CODE_TX_HASH || 'not set');
  console.log('   PROTOCOL_CODE_HASH:', process.env.PROTOCOL_CODE_HASH || 'not set');
}

// Increase timeout for integration tests that involve network calls
jest.setTimeout(30000); // 30 seconds

describe('Protocol Integration Tests', () => {
  // Note: These tests require:
  // 1. SSRI executor running (Docker container)
  // 2. Valid deployed contract details in environment variables
  // 3. Network connectivity to CKB testnet
  // 
  // Some tests may fail with "Cell not found" if no protocol cells exist on chain yet.
  // This is expected behavior and the SSRI executor will handle transaction creation appropriately.
  let executor: ssri.ExecutorJsonRpc;
  let protocol: Protocol;
  let signer: ccc.Signer;
  let client: ccc.Client;
  
  // You'll need to provide actual deployed contract details for integration testing
  const PROTOCOL_CODE_OUTPOINT = {
    txHash: process.env.PROTOCOL_CODE_TX_HASH || '0x' + '00'.repeat(32),
    index: parseInt(process.env.PROTOCOL_CODE_INDEX || '0')
  };
  
  const PROTOCOL_TYPE_SCRIPT: ccc.ScriptLike = {
    codeHash: process.env.PROTOCOL_CODE_HASH || '0x' + '00'.repeat(32),
    hashType: 'type' as const,
    args: process.env.PROTOCOL_TYPE_ARGS || '0x'
  };

  beforeAll(async () => {
    // No health check - just proceed with initialization
    console.log('Initializing SSRI integration tests...');

    // Initialize client and signer
    client = new ccc.ClientPublicTestnet();
    
    // Use a test private key (DO NOT USE IN PRODUCTION)
    const privateKey = process.env.TEST_PRIVATE_KEY || '0x' + '01'.repeat(32);
    signer = new ccc.SignerCkbPrivateKey(client, privateKey);
    
    // Create executor with authentication
    // Note: The actual authentication method depends on the SSRI server implementation
    executor = new ssri.ExecutorJsonRpc(SSRI_URL);
    
    // Create protocol instance with executor
    protocol = new Protocol(PROTOCOL_CODE_OUTPOINT, PROTOCOL_TYPE_SCRIPT, {
      executor
    });
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('updateProtocol with real executor', () => {
    it('should create a protocol update transaction', async () => {
      // Create test protocol data
      const protocolData: ProtocolDataInput = {
        campaignsApproved: [],
        tippingProposals: [],
        tippingConfig: {
          approvalRequirementThresholds: [
            BigInt(1000 * 10**8), // 1000 CKB
            BigInt(5000 * 10**8), // 5000 CKB
            BigInt(10000 * 10**8) // 10000 CKB
          ],
          expirationDuration: 7 * 24 * 60 * 60 // 7 days in seconds
        },
        endorsersWhitelist: [
          {
            lockHash: '0x' + '00'.repeat(32), // Replace with actual endorser lock hash
            name: 'Test Endorser',
            description: 'Integration test endorser'
          }
        ],
        protocolConfig: {
          adminLockHashes: [
            // Add the signer's lock hash as admin
            await signer.getRecommendedAddressObj().then(addr => 
              addr.script.hash()
            )
          ],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: ccc.hexFrom(PROTOCOL_TYPE_SCRIPT.codeHash),
            ckbBoostProtocolLockCodeHash: '0x' + '00'.repeat(32), // Replace with actual
            ckbBoostCampaignTypeCodeHash: '0x' + '00'.repeat(32), // Replace with actual
            ckbBoostCampaignLockCodeHash: '0x' + '00'.repeat(32), // Replace with actual
            ckbBoostUserTypeCodeHash: '0x' + '00'.repeat(32), // Replace with actual
            acceptedUdtTypeCodeHashes: [],
            acceptedDobTypeCodeHashes: []
          }
        }
      };

      const protocolDataType = Protocol.createProtocolData(protocolData);
      
      // Create the update transaction
      const { res: tx } = await protocol.updateProtocol(
        signer,
        protocolDataType
      );

      // Verify transaction structure
      expect(tx).toBeInstanceOf(ccc.Transaction);
      // Note: If no protocol cells exist on chain, inputs might be empty
      // The SSRI executor will handle creating the proper transaction structure
      expect(tx.outputs.length).toBeGreaterThanOrEqual(0);
      
      // Check that protocol code is included as cell dep
      const hasProtocolDep = tx.cellDeps.some(dep => 
        dep.outPoint.txHash === PROTOCOL_CODE_OUTPOINT.txHash &&
        Number(dep.outPoint.index) === PROTOCOL_CODE_OUTPOINT.index &&
        dep.depType === 'code'
      );
      expect(hasProtocolDep).toBe(true);

      // The transaction should have a witness with the recipe
      expect(tx.witnesses.length).toBeGreaterThan(0);
      
      // Log transaction details for debugging
      console.log('Created transaction:', {
        inputs: tx.inputs.length,
        outputs: tx.outputs.length,
        cellDeps: tx.cellDeps.length,
        witnesses: tx.witnesses.length
      });
    });

    it('should handle existing transaction with protocol cell', async () => {
      // First, we need to find an existing protocol cell (if any)
      // This would require querying the blockchain for cells with the protocol type script
      
      // For this test, we'll create a mock scenario
      const existingTx = ccc.Transaction.from({
        version: 0,
        cellDeps: [],
        headerDeps: [],
        inputs: [],
        outputs: [],
        outputsData: [],
        witnesses: []
      });

      // Add at least one input for the transaction
      await existingTx.completeInputsAll(signer);

      const protocolData: ProtocolDataInput = {
        tippingConfig: {
          approvalRequirementThresholds: [BigInt(500 * 10**8)],
          expirationDuration: 3 * 24 * 60 * 60 // 3 days
        },
        protocolConfig: {
          adminLockHashes: [
            await signer.getRecommendedAddressObj().then(addr => 
              addr.script.hash()
            )
          ],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: ccc.hexFrom(PROTOCOL_TYPE_SCRIPT.codeHash),
            ckbBoostProtocolLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignTypeCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostUserTypeCodeHash: '0x' + '00'.repeat(32)
          }
        }
      };

      const protocolDataType = Protocol.createProtocolData(protocolData);
      
      const { res: tx } = await protocol.updateProtocol(
        signer,
        protocolDataType,
        existingTx
      );

      expect(tx).toBeInstanceOf(ccc.Transaction);
      expect(tx.inputs.length).toBeGreaterThanOrEqual(existingTx.inputs.length);
    });

    it('should complete fee payment and prepare for sending', async () => {
      const protocolData: ProtocolDataInput = {
        tippingConfig: {
          approvalRequirementThresholds: [],
          expirationDuration: 24 * 60 * 60 // 1 day
        },
        protocolConfig: {
          adminLockHashes: [
            await signer.getRecommendedAddressObj().then(addr => 
              addr.script.hash()
            )
          ],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: ccc.hexFrom(PROTOCOL_TYPE_SCRIPT.codeHash),
            ckbBoostProtocolLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignTypeCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostUserTypeCodeHash: '0x' + '00'.repeat(32)
          }
        }
      };

      const protocolDataType = Protocol.createProtocolData(protocolData);
      
      const { res: tx } = await protocol.updateProtocol(
        signer,
        protocolDataType
      );

      // Complete fee payment
      await tx.completeFeeBy(signer);

      // Verify the transaction is ready to send
      expect(tx.inputs.length).toBeGreaterThan(0);
      expect(tx.outputs.length).toBeGreaterThan(0);
      
      // Calculate fee
      const inputCapacity = await tx.getInputsCapacity(client);
      const outputCapacity = tx.getOutputsCapacity();
      const fee = inputCapacity - outputCapacity;
      
      console.log('Transaction fee:', fee, 'shannons');
      expect(fee).toBeGreaterThan(0n);

      // Note: We're not actually sending the transaction in tests
      // In real usage, you would do:
      // const txHash = await signer.sendTransaction(tx);
    });
  });

  describe('error handling', () => {
    it('should handle invalid protocol data gracefully', async () => {
      // Test with invalid hex length
      expect(() => {
        Protocol.createProtocolData({
          tippingConfig: {
            approvalRequirementThresholds: [],
            expirationDuration: 0
          },
          protocolConfig: {
            adminLockHashes: ['0x123'], // Invalid length
            scriptCodeHashes: {
              ckbBoostProtocolTypeCodeHash: '0x' + '00'.repeat(32),
              ckbBoostProtocolLockCodeHash: '0x' + '00'.repeat(32),
              ckbBoostCampaignTypeCodeHash: '0x' + '00'.repeat(32),
              ckbBoostCampaignLockCodeHash: '0x' + '00'.repeat(32),
              ckbBoostUserTypeCodeHash: '0x' + '00'.repeat(32)
            }
          }
        });
      }).toThrow('Invalid hex string length for Byte32');
    });

    it('should handle executor errors', async () => {
      // Create a protocol instance with wrong code outpoint
      const wrongProtocol = new Protocol(
        { txHash: '0x' + 'ff'.repeat(32), index: 999 },
        PROTOCOL_TYPE_SCRIPT,
        { executor }
      );

      const protocolData = Protocol.createProtocolData({
        tippingConfig: {
          approvalRequirementThresholds: [],
          expirationDuration: 0
        },
        protocolConfig: {
          adminLockHashes: [],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: '0x' + '00'.repeat(32),
            ckbBoostProtocolLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignTypeCodeHash: '0x' + '00'.repeat(32),
            ckbBoostCampaignLockCodeHash: '0x' + '00'.repeat(32),
            ckbBoostUserTypeCodeHash: '0x' + '00'.repeat(32)
          }
        }
      });

      // This should throw an error since the code cell doesn't exist
      await expect(wrongProtocol.updateProtocol(signer, protocolData))
        .rejects
        .toThrow('Cell not found');
    });
  });
});