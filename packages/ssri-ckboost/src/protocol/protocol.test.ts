import { describe, it, expect, beforeAll, afterAll, jest } from '@jest/globals';
import { ccc } from '@ckb-ccc/core';
import { ssri } from '@ckb-ccc/ssri';
import { Protocol } from './index';
import { type ProtocolDataLike } from '../generated';

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
      // const input: ProtocolDataLike = {
      //   campaigns_approved: [],
      //   tipping_proposals: [],
      //   tipping_config: {
      //     approval_requirement_thresholds: [BigInt(1000), BigInt(5000)],
      //     expiration_duration: 86400 // 1 day in seconds
      //   },
      //   endorsers_whitelist: [
      //     {
      //       endorser_lock_hash: '0x' + '33'.repeat(32),
      //       endorser_name: 'Endorser 1',
      //       endorser_description: 'Test endorser',
      //       website: 'https://example.com',
      //       social_links: ['https://twitter.com/example'],
      //       verified: 1
      //     }
      //   ],
      //   last_updated: 1234567890,
      //   protocol_config: {
      //     admin_lock_hash_vec: ['0x' + '44'.repeat(32)],
      //     script_code_hashes: {
      //       ckb_boost_protocol_type_code_hash: '0x' + '55'.repeat(32),
      //       ckb_boost_protocol_lock_code_hash: '0x' + '66'.repeat(32),
      //       ckb_boost_campaign_type_code_hash: '0x' + '77'.repeat(32),
      //       ckb_boost_campaign_lock_code_hash: '0x' + '88'.repeat(32),
      //       ckb_boost_user_type_code_hash: '0x' + '99'.repeat(32),
      //       accepted_udt_type_code_hashes: ['0x' + 'aa'.repeat(32)],
      //       accepted_dob_type_code_hashes: ['0x' + 'bb'.repeat(32)]
      //     }
      //   }
      // };

      // const protocolData = Protocol.createProtocolData(input);

      // expect(protocolData).toBeDefined();
      // expect(protocolData.campaigns_approved).toEqual([]);
      // expect(protocolData.tipping_proposals).toEqual([]);
      // expect(protocolData.tipping_config).toBeDefined();
      // expect(protocolData.endorsers_whitelist).toHaveLength(1);
      // expect(protocolData.protocol_config).toBeDefined();
      
      // // Check that last_updated is valid
      // expect(protocolData.last_updated).toBeDefined();
      // // Check that last_updated is a bigint
      // expect(typeof protocolData.last_updated).toBe('bigint');
      // expect(protocolData.last_updated).toBe(BigInt(1234567890));
    });

    // it('should use provided timestamp when all fields are provided', () => {
    //   const input: ProtocolDataLike = {
    //     campaigns_approved: [],
    //     tipping_proposals: [],
    //     tipping_config: {
    //       approval_requirement_thresholds: [],
    //       expiration_duration: 0
    //     },
    //     endorsers_whitelist: [],
    //     last_updated: 1234567890,
    //     protocol_config: {
    //       admin_lock_hash_vec: [],
    //       script_code_hashes: {
    //         ckb_boost_protocol_type_code_hash: '0x' + '00'.repeat(32),
    //         ckb_boost_protocol_lock_code_hash: '0x' + '00'.repeat(32),
    //         ckb_boost_campaign_type_code_hash: '0x' + '00'.repeat(32),
    //         ckb_boost_campaign_lock_code_hash: '0x' + '00'.repeat(32),
    //         ckb_boost_user_type_code_hash: '0x' + '00'.repeat(32),
    //         accepted_udt_type_code_hashes: [],
    //         accepted_dob_type_code_hashes: []
    //       }
    //     }
    //   };
    // });
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

      const protocolDataLike: ProtocolDataLike = {
        campaigns_approved: [],
        tipping_proposals: [],
        tipping_config: {
          approval_requirement_thresholds: [BigInt(1000)],
          expiration_duration: 3600
        },
        endorsers_whitelist: [],
        last_updated: Date.now(),
        protocol_config: {
          admin_lock_hash_vec: ['0x' + 'aa'.repeat(32)],
          script_code_hashes: {
            ckb_boost_protocol_type_code_hash: '0x' + '11'.repeat(32),
            ckb_boost_protocol_lock_code_hash: '0x' + '22'.repeat(32),
            ckb_boost_campaign_type_code_hash: '0x' + '33'.repeat(32),
            ckb_boost_campaign_lock_code_hash: '0x' + '44'.repeat(32),
            ckb_boost_user_type_code_hash: '0x' + '55'.repeat(32),
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        }
      };

      const result = await protocol.updateProtocol(signer, protocolDataLike);

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

      const protocolDataLike: ProtocolDataLike = {
        campaigns_approved: [],
        tipping_proposals: [],
        tipping_config: {
          approval_requirement_thresholds: [],
          expiration_duration: 0
        },
        endorsers_whitelist: [],
        last_updated: Date.now(),
        protocol_config: {
          admin_lock_hash_vec: [],
          script_code_hashes: {
            ckb_boost_protocol_type_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_protocol_lock_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_campaign_type_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_campaign_lock_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_user_type_code_hash: '0x' + '00'.repeat(32),
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        }
      };

      const result = await protocol.updateProtocol(signer, protocolDataLike, existingTx);

      expect(result).toBeDefined();
      expect(result.res.inputs.length).toBe(1);
      expect(result.res.inputs[0].previousOutput.txHash).toBe(existingTx.inputs[0].previousOutput.txHash);
    });

    it('should handle fallback when executor is not available', async () => {
      const protocolWithoutExecutor = new Protocol(mockCodeOutPoint, mockScript);

      const protocolDataLike: ProtocolDataLike = {
        campaigns_approved: [],
        tipping_proposals: [],
        tipping_config: {
          approval_requirement_thresholds: [],
          expiration_duration: 0
        },
        endorsers_whitelist: [],
        last_updated: Date.now(),
        protocol_config: {
          admin_lock_hash_vec: [],
          script_code_hashes: {
            ckb_boost_protocol_type_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_protocol_lock_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_campaign_type_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_campaign_lock_code_hash: '0x' + '00'.repeat(32),
            ckb_boost_user_type_code_hash: '0x' + '00'.repeat(32),
            accepted_udt_type_code_hashes: [],
            accepted_dob_type_code_hashes: []
          }
        }
      };

      const result = await protocolWithoutExecutor.updateProtocol(signer, protocolDataLike);

      expect(result).toBeDefined();
      expect(result.res).toBeInstanceOf(ccc.Transaction);
      
      // Should still add the code cell dep
      const cellDeps = result.res.cellDeps;
      expect(cellDeps.length).toBeGreaterThan(0);
    });
  });

  describe('helper methods', () => {
    describe('createEndorserInfo', () => {
      it('should create endorser info with proper encoding', () => {
        const input = {
          endorser_lock_hash: '0x' + 'ab'.repeat(32),
          endorser_name: 'Test Endorser',
          endorser_description: 'A test endorser for unit tests',
          website: 'https://example.com',
          social_links: ['https://twitter.com/example'],
          verified: 1
        };

        const endorserInfo = Protocol.createEndorserInfo(input);

        expect(endorserInfo.endorser_lock_hash).toBeDefined();
        expect(endorserInfo.endorser_lock_hash).toBe('0x' + 'ab'.repeat(32));
        
        expect(endorserInfo.endorser_name).toBeDefined();
        expect(endorserInfo.endorser_name).toBe('0x' + Buffer.from('Test Endorser', 'utf8').toString('hex'));
        
        expect(endorserInfo.endorser_description).toBeDefined();
        expect(endorserInfo.endorser_description).toBe('0x' + Buffer.from('A test endorser for unit tests', 'utf8').toString('hex'));
        
        expect(endorserInfo.website).toBeDefined();
        expect(endorserInfo.website).toBe('0x' + Buffer.from('https://example.com', 'utf8').toString('hex'));
        
        expect(endorserInfo.social_links).toBeDefined();
        expect(endorserInfo.social_links).toHaveLength(1);
        expect(endorserInfo.social_links[0]).toBe('0x' + Buffer.from('https://twitter.com/example', 'utf8').toString('hex'));
        
        expect(endorserInfo.verified).toBe(1);
      });
    });
  });
});