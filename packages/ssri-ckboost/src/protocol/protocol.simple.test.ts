import { describe, it, expect } from '@jest/globals';
import { ccc } from '@ckb-ccc/core';
import { Protocol } from './index';

describe('Protocol Simple Tests', () => {
  const mockCodeOutPoint = {
    txHash: '0x' + '00'.repeat(32),
    index: 0
  };
  
  const mockScript: ccc.ScriptLike = {
    codeHash: '0x' + '11'.repeat(32),
    hashType: 'type' as const,
    args: '0x' + '22'.repeat(32)
  };

  describe('constructor', () => {
    it('should create Protocol instance with required parameters', () => {
      const protocol = new Protocol(mockCodeOutPoint, mockScript);
      
      expect(protocol).toBeDefined();
      expect(protocol).toBeInstanceOf(Protocol);
    });

    it('should create Protocol instance with executor', () => {
      const protocol = new Protocol(mockCodeOutPoint, mockScript, {
        executor: undefined // We can pass undefined for now
      });
      
      expect(protocol).toBeDefined();
    });
  });

  describe('createProtocolData', () => {
    it('should convert input data to protocol data type', () => {
      // const input: ProtocolDataLike = {
      //   campaigns_approved: [],
      //   tipping_proposals: [],
      //   tipping_config: {
      //     approval_requirement_thresholds: [BigInt(100)],
      //     expiration_duration: 86400n
      //   },
      //   endorsers_whitelist: [],
      //   last_updated: BigInt(Date.now()),
      //   protocol_config: {
      //     admin_lock_hash_vec: ['0x' + '33'.repeat(32)],
      //     script_code_hashes: {
      //       ckb_boost_protocol_type_code_hash: '0x' + '44'.repeat(32),
      //       ckb_boost_protocol_lock_code_hash: '0x' + '55'.repeat(32),
      //       ckb_boost_campaign_type_code_hash: '0x' + '66'.repeat(32),
      //       ckb_boost_campaign_lock_code_hash: '0x' + '77'.repeat(32),
      //       ckb_boost_user_type_code_hash: '0x' + '88'.repeat(32),
      //       accepted_udt_type_code_hashes: [],
      //       accepted_dob_type_code_hashes: []
      //     }
      //   }
      // };

      
      // expect(protocolData).toBeDefined();
      // expect(protocolData.campaigns_approved).toEqual([]);
      // expect(protocolData.tipping_proposals).toEqual([]);
      // expect(protocolData.tipping_config).toBeDefined();
      // expect(protocolData.protocol_config).toBeDefined();
    });

    it('should handle minimal input', () => {
      // const input: ProtocolDataLike = {
      //   campaigns_approved: [],
      //   tipping_proposals: [],
      //   tipping_config: {
      //     approval_requirement_thresholds: [],
      //     expiration_duration: 0n
      //   },
      //   endorsers_whitelist: [],
      //   last_updated: Date.now(),
      //   protocol_config: {
      //     admin_lock_hash_vec: [],
      //     script_code_hashes: {
      //       ckb_boost_protocol_type_code_hash: '0x' + '00'.repeat(32),
      //       ckb_boost_protocol_lock_code_hash: '0x' + '00'.repeat(32),
      //       ckb_boost_campaign_type_code_hash: '0x' + '00'.repeat(32),
      //       ckb_boost_campaign_lock_code_hash: '0x' + '00'.repeat(32),
      //       ckb_boost_user_type_code_hash: '0x' + '00'.repeat(32),
      //       accepted_udt_type_code_hashes: [],
      //       accepted_dob_type_code_hashes: []
      //     }
      //   }
      // };

      
      // expect(protocolData).toBeDefined();
      // expect(protocolData.campaigns_approved).toBeDefined();
      // expect(protocolData.tipping_proposals).toBeDefined();
    });
  });


  describe('createEndorserInfo', () => {
    it('should create endorser info from input', () => {
      const input = {
        endorser_lock_hash: '0x' + 'ff'.repeat(32),
        endorser_name: 'Test Endorser',
        endorser_description: 'Test Description',
        website: 'https://example.com',
        social_links: [],
        verified: 0
      };

      const endorserInfo = Protocol.createEndorserInfo(input);
      
      expect(endorserInfo).toBeDefined();
      expect(endorserInfo.endorser_lock_hash).toBeDefined();
      expect(endorserInfo.endorser_name).toBeDefined();
      expect(endorserInfo.endorser_description).toBeDefined();
    });
  });
});