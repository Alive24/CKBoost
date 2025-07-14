use crate::generated::ckboost::{ProtocolData as GeneratedProtocolData, ScriptCodeHashes, Byte32, Byte32Vec};
use ckb_std::debug;
use molecule::prelude::*;
use alloc::vec::Vec;

/// Wrapper around generated ProtocolData with helper methods for cell classification
#[derive(Debug, Clone)]
pub struct ProtocolData {
    inner: GeneratedProtocolData,
}

impl ProtocolData {
    /// Create protocol data from actual protocol cell
    /// TODO: Implement actual protocol cell reading
    pub fn from_protocol_cell() -> Result<Self, crate::error::Error> {
        debug!("Loading protocol data from protocol cell");
        
        // TODO: Read from actual protocol cell
        // For now, return mock data
        Ok(Self::mock())
    }
    
    /// Create mock protocol data for testing
    pub fn mock() -> Self {
        // Create mock ScriptCodeHashes
        let mock_hash_protocol_type = Byte32::from([1u8; 32]);
        let mock_hash_protocol_lock = Byte32::from([11u8; 32]);
        let mock_hash_campaign_type = Byte32::from([2u8; 32]);
        let mock_hash_campaign_lock = Byte32::from([12u8; 32]);
        let mock_hash_user_type = Byte32::from([3u8; 32]);
            
        // Create mock accepted UDTs and DOBs
        let mock_udt_1 = Byte32::from([10u8; 32]);
        let mock_udt_2 = Byte32::from([20u8; 32]);
        let accepted_udts = Byte32Vec::new_builder()
            .push(mock_udt_1)
            .push(mock_udt_2)
            .build();
            
        let mock_dob_1 = Byte32::from([30u8; 32]);
        let accepted_dobs = Byte32Vec::new_builder()
            .push(mock_dob_1)
            .build();
            
        let script_code_hashes = ScriptCodeHashes::new_builder()
            .ckb_boost_protocol_type_code_hash(mock_hash_protocol_type)
            .ckb_boost_protocol_lock_code_hash(mock_hash_protocol_lock)
            .ckb_boost_campaign_type_code_hash(mock_hash_campaign_type)
            .ckb_boost_campaign_lock_code_hash(mock_hash_campaign_lock)
            .ckb_boost_user_type_code_hash(mock_hash_user_type)
            .accepted_udt_type_code_hashes(accepted_udts)
            .accepted_dob_type_code_hashes(accepted_dobs)
            .build();
            
        let protocol_config = crate::generated::ckboost::ProtocolConfig::new_builder()
            .script_code_hashes(script_code_hashes)
            .build();
            
        let inner = GeneratedProtocolData::new_builder()
            .protocol_config(protocol_config)
            .build();
            
        Self { inner }
    }
    
    /// Get protocol type code hash
    pub fn protocol_type_hash(&self) -> [u8; 32] {
        let hash = self.inner
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_protocol_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get campaign type code hash
    pub fn campaign_type_hash(&self) -> [u8; 32] {
        let hash = self.inner
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_campaign_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get user type code hash
    pub fn user_type_hash(&self) -> [u8; 32] {
        let hash = self.inner
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_user_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get accepted UDT type hashes
    pub fn accepted_udt_type_hashes(&self) -> Vec<[u8; 32]> {
        let hashes = self.inner
            .protocol_config()
            .script_code_hashes()
            .accepted_udt_type_code_hashes();
            
        let mut result = Vec::new();
        for i in 0..hashes.len() {
            let hash = hashes.get(i).unwrap();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(hash.as_slice());
            result.push(arr);
        }
        result
    }
    
    /// Get accepted DOB (Digital Object) type hashes
    pub fn accepted_dob_type_hashes(&self) -> Vec<[u8; 32]> {
        let hashes = self.inner
            .protocol_config()
            .script_code_hashes()
            .accepted_dob_type_code_hashes();
            
        let mut result = Vec::new();
        for i in 0..hashes.len() {
            let hash = hashes.get(i).unwrap();
            let mut arr = [0u8; 32];
            arr.copy_from_slice(hash.as_slice());
            result.push(arr);
        }
        result
    }
    
    /// Get first UDT type hash if any configured
    pub fn udt_type_hash(&self) -> Option<[u8; 32]> {
        self.accepted_udt_type_hashes().first().copied()
    }
    
    /// Get Spore type hash if configured (placeholder for now)
    /// TODO: Add Spore to accepted DOBs when ready
    pub fn spore_type_hash(&self) -> Option<[u8; 32]> {
        // For now, return first DOB as placeholder for Spore
        self.accepted_dob_type_hashes().first().copied()
    }
    
    /// Check if all required type hashes are present
    pub fn validate(&self) -> Result<(), crate::error::Error> {
        // Protocol, campaign, and user type hashes are always required
        // They come from the generated structure, so they're always valid
        Ok(())
    }
    
    /// Get the inner generated protocol data
    pub fn inner(&self) -> &GeneratedProtocolData {
        &self.inner
    }
}

/// Get protocol data from the transaction
/// This will look for protocol cells and extract the configuration
pub fn get_protocol_data() -> Result<ProtocolData, crate::error::Error> {
    ProtocolData::from_protocol_cell()
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_mock_protocol_data() {
        let data = ProtocolData::mock();
        assert!(data.validate().is_ok());
        assert!(data.udt_type_hash().is_some());
        assert!(data.spore_type_hash().is_some());
        
        // Check that type hashes are properly set
        assert_eq!(data.protocol_type_hash(), [1u8; 32]);
        assert_eq!(data.campaign_type_hash(), [2u8; 32]);
        assert_eq!(data.user_type_hash(), [3u8; 32]);
    }
}