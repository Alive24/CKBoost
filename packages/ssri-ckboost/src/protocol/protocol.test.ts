import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { ccc } from '@ckb-ccc/core';
import { ssri } from '@ckb-ccc/ssri';
import { Protocol } from './index';
import type { ProtocolDataInput } from '../types';

// Mock SSRI executor for testing
class MockExecutor extends ssri.Executor {
  private mockResponses: Map<string, ccc.Hex> = new Map();
  
  setMockResponse(methodPath: string, response: Uint8Array) {
    this.mockResponses.set(methodPath, ccc.hexFrom(response));
  }

  async runScript(
    _codeOutPoint: ccc.OutPointLike,
    method: string,
    _args: ccc.HexLike[],
    _context?: ssri.ContextCode | ssri.ContextScript | ssri.ContextCell | ssri.ContextTransaction
  ): Promise<ssri.ExecutorResponse<ccc.Hex>> {
    const response = this.mockResponses.get(method);
    if (response) {
      return ssri.ExecutorResponse.new(response);
    }
    throw new ssri.ExecutorErrorExecutionFailed('Method not mocked');
  }

  async runScriptTry(
    _codeOutPoint: ccc.OutPointLike,
    method: string,
    _args: ccc.HexLike[],
    _context?: ssri.ContextCode | ssri.ContextScript | ssri.ContextCell | ssri.ContextTransaction
  ): Promise<ssri.ExecutorResponse<ccc.Hex> | undefined> {
    const response = this.mockResponses.get(method);
    if (response) {
      return ssri.ExecutorResponse.new(response);
    }
    return undefined;
  }
}

describe('Protocol', () => {
  let mockExecutor: MockExecutor;
  let protocol: Protocol;
  let signer: ccc.Signer;
  
  const mockCodeOutPoint = {
    txHash: '0x' + '00'.repeat(32),
    index: 0
  };
  
  const mockScript: ccc.ScriptLike = {
    codeHash: '0x' + '11'.repeat(32),
    hashType: 'type' as const,
    args: '0x' + '22'.repeat(32)
  };

  beforeAll(async () => {
    // Create a mock signer
    const client = new ccc.ClientPublicTestnet();
    signer = new ccc.SignerCkbPrivateKey(
      client,
      '0x0000000000000000000000000000000000000000000000000000000000000001'
    );
    
    mockExecutor = new MockExecutor();
    
    protocol = new Protocol(mockCodeOutPoint, mockScript, {
      executor: mockExecutor
    });
  });

  afterAll(() => {
    jest.clearAllMocks();
  });

  describe('createProtocolData', () => {
    it('should create protocol data with all fields', () => {
      const input: ProtocolDataInput = {
        campaignsApproved: [],
        tippingProposals: [],
        tippingConfig: {
          approvalRequirementThresholds: [BigInt(1000), BigInt(5000)],
          expirationDuration: 86400 // 1 day in seconds
        },
        endorsersWhitelist: [
          {
            lockHash: '0x' + '33'.repeat(32),
            name: 'Endorser 1',
            description: 'Test endorser'
          }
        ],
        lastUpdated: 1234567890,
        protocolConfig: {
          adminLockHashes: ['0x' + '44'.repeat(32)],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: '0x' + '55'.repeat(32),
            ckbBoostProtocolLockCodeHash: '0x' + '66'.repeat(32),
            ckbBoostCampaignTypeCodeHash: '0x' + '77'.repeat(32),
            ckbBoostCampaignLockCodeHash: '0x' + '88'.repeat(32),
            ckbBoostUserTypeCodeHash: '0x' + '99'.repeat(32),
            acceptedUdtTypeCodeHashes: ['0x' + 'aa'.repeat(32)],
            acceptedDobTypeCodeHashes: ['0x' + 'bb'.repeat(32)]
          }
        }
      };

      const protocolData = Protocol.createProtocolData(input);

      expect(protocolData).toBeDefined();
      expect(protocolData.campaigns_approved).toEqual([]);
      expect(protocolData.tipping_proposals).toEqual([]);
      expect(protocolData.tipping_config).toBeDefined();
      expect(protocolData.endorsers_whitelist).toHaveLength(1);
      expect(protocolData.protocol_config).toBeDefined();
      
      // Check that last_updated is valid
      expect(protocolData.last_updated).toBeDefined();
      // Convert to ArrayBuffer for checking
      const lastUpdatedBuffer = protocolData.last_updated instanceof ArrayBuffer 
        ? protocolData.last_updated 
        : (protocolData.last_updated as any).toArrayBuffer();
      expect(lastUpdatedBuffer.byteLength).toBe(8);
    });

    it('should use current timestamp when lastUpdated is not provided', () => {
      const input: ProtocolDataInput = {
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
      };

      const beforeTime = Date.now();
      const protocolData = Protocol.createProtocolData(input);
      const afterTime = Date.now();

      // Extract timestamp from ArrayBuffer
      const lastUpdatedBuffer = protocolData.last_updated instanceof ArrayBuffer 
        ? protocolData.last_updated 
        : (protocolData.last_updated as any).toArrayBuffer();
      const view = new DataView(lastUpdatedBuffer);
      const timestamp = Number(view.getBigUint64(0, true));

      expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
      expect(timestamp).toBeLessThanOrEqual(afterTime);
    });
  });

  describe('updateProtocol', () => {
    it('should call executor with correct parameters', async () => {
      // Create a mock transaction that would be returned by the executor
      const mockTx = ccc.Transaction.from({
        version: 0,
        cellDeps: [],
        headerDeps: [],
        inputs: [{
          previousOutput: {
            txHash: '0x' + 'ff'.repeat(32),
            index: 0
          },
          since: '0x0'
        }],
        outputs: [{
          capacity: '0x174876e800', // 100 CKB
          lock: {
            codeHash: '0x' + '00'.repeat(32),
            hashType: 'type' as const,
            args: '0x' + '00'.repeat(20)
          }
        }],
        outputsData: ['0x'],
        witnesses: ['0x']
      });

      // Set up the mock response
      mockExecutor.setMockResponse(
        'CKBoostProtocol.update_protocol',
        mockTx.toBytes()
      );

      const protocolData = Protocol.createProtocolData({
        tippingConfig: {
          approvalRequirementThresholds: [BigInt(1000)],
          expirationDuration: 3600
        },
        protocolConfig: {
          adminLockHashes: ['0x' + 'aa'.repeat(32)],
          scriptCodeHashes: {
            ckbBoostProtocolTypeCodeHash: '0x' + '11'.repeat(32),
            ckbBoostProtocolLockCodeHash: '0x' + '22'.repeat(32),
            ckbBoostCampaignTypeCodeHash: '0x' + '33'.repeat(32),
            ckbBoostCampaignLockCodeHash: '0x' + '44'.repeat(32),
            ckbBoostUserTypeCodeHash: '0x' + '55'.repeat(32)
          }
        }
      });

      const result = await protocol.updateProtocol(signer, protocolData);

      expect(result).toBeDefined();
      expect(result.res).toBeInstanceOf(ccc.Transaction);
      
      // Verify that the code cell dep was added
      const cellDeps = result.res.cellDeps;
      expect(cellDeps.length).toBeGreaterThan(0);
      const codeDep = cellDeps.find(dep => 
        dep.outPoint.txHash === mockCodeOutPoint.txHash &&
        Number(dep.outPoint.index) === mockCodeOutPoint.index
      );
      expect(codeDep).toBeDefined();
      expect(codeDep?.depType).toBe('code');
    });

    it('should handle transaction with existing inputs', async () => {
      const existingTx = ccc.Transaction.from({
        version: 0,
        cellDeps: [],
        headerDeps: [],
        inputs: [{
          previousOutput: {
            txHash: '0x' + 'ee'.repeat(32),
            index: 1
          },
          since: '0x0'
        }],
        outputs: [],
        outputsData: [],
        witnesses: []
      });

      const mockResultTx = ccc.Transaction.from({
        ...existingTx,
        outputs: [{
          capacity: '0x174876e800',
          lock: {
            codeHash: '0x' + '00'.repeat(32),
            hashType: 'type' as const,
            args: '0x' + '00'.repeat(20)
          }
        }],
        outputsData: ['0x']
      });

      mockExecutor.setMockResponse(
        'CKBoostProtocol.update_protocol',
        mockResultTx.toBytes()
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

      const result = await protocol.updateProtocol(signer, protocolData, existingTx);

      expect(result).toBeDefined();
      expect(result.res.inputs.length).toBe(1);
      expect(result.res.inputs[0].previousOutput.txHash).toBe(existingTx.inputs[0].previousOutput.txHash);
    });

    it('should handle fallback when executor is not available', async () => {
      const protocolWithoutExecutor = new Protocol(mockCodeOutPoint, mockScript);

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

      const result = await protocolWithoutExecutor.updateProtocol(signer, protocolData);

      expect(result).toBeDefined();
      expect(result.res).toBeInstanceOf(ccc.Transaction);
      
      // Should still add the code cell dep
      const cellDeps = result.res.cellDeps;
      expect(cellDeps.length).toBeGreaterThan(0);
    });
  });

  describe('helper methods', () => {
    describe('hexToBytes32Buffer', () => {
      it('should convert hex string to Byte32 buffer', () => {
        const hex = '0x' + '12'.repeat(32);
        const buffer = Protocol['hexToBytes32Buffer'](hex);
        
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        expect(buffer.byteLength).toBe(32);
        
        const view = new Uint8Array(buffer);
        expect(view[0]).toBe(0x12);
        expect(view[31]).toBe(0x12);
      });

      it('should handle hex without 0x prefix', () => {
        const hex = '12'.repeat(32);
        const buffer = Protocol['hexToBytes32Buffer'](hex);
        
        expect(buffer.byteLength).toBe(32);
      });

      it('should throw error for invalid hex length', () => {
        expect(() => {
          Protocol['hexToBytes32Buffer']('0x1234');
        }).toThrow('Invalid hex string length for Byte32');
      });
    });

    describe('numberToUint64Buffer', () => {
      it('should convert number to Uint64 buffer', () => {
        const num = 1234567890;
        const buffer = Protocol['numberToUint64Buffer'](num);
        
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        expect(buffer.byteLength).toBe(8);
        
        const view = new DataView(buffer);
        expect(view.getBigUint64(0, true)).toBe(BigInt(num));
      });
    });

    describe('bigintToUint128Buffer', () => {
      it('should convert bigint to Uint128 buffer', () => {
        const value = BigInt('12345678901234567890');
        const buffer = Protocol['bigintToUint128Buffer'](value);
        
        expect(buffer).toBeInstanceOf(ArrayBuffer);
        expect(buffer.byteLength).toBe(16);
      });

      it('should handle max uint128 value', () => {
        const maxValue = (BigInt(1) << BigInt(128)) - BigInt(1);
        const buffer = Protocol['bigintToUint128Buffer'](maxValue);
        
        expect(buffer.byteLength).toBe(16);
        const view = new Uint8Array(buffer);
        expect(view.every(byte => byte === 0xFF)).toBe(true);
      });
    });

    describe('createEndorserInfo', () => {
      it('should create endorser info with proper encoding', () => {
        const input = {
          lockHash: '0x' + 'ab'.repeat(32),
          name: 'Test Endorser',
          description: 'A test endorser for unit tests'
        };

        const endorserInfo = Protocol.createEndorserInfo(input);

        expect(endorserInfo.endorser_lock_hash).toBeDefined();
        const lockHashBuffer = endorserInfo.endorser_lock_hash instanceof ArrayBuffer 
          ? endorserInfo.endorser_lock_hash 
          : (endorserInfo.endorser_lock_hash as any).toArrayBuffer();
        expect(lockHashBuffer.byteLength).toBe(32);
        
        expect(endorserInfo.endorser_name).toBeDefined();
        const nameBuffer = endorserInfo.endorser_name instanceof ArrayBuffer 
          ? endorserInfo.endorser_name 
          : (endorserInfo.endorser_name as any).toArrayBuffer();
        const nameDecoded = new TextDecoder().decode(nameBuffer);
        expect(nameDecoded).toBe(input.name);
        
        expect(endorserInfo.endorser_description).toBeDefined();
        const descBuffer = endorserInfo.endorser_description instanceof ArrayBuffer 
          ? endorserInfo.endorser_description 
          : (endorserInfo.endorser_description as any).toArrayBuffer();
        const descDecoded = new TextDecoder().decode(descBuffer);
        expect(descDecoded).toBe(input.description);
      });
    });
  });
});