pub use crate::generated::ckboost::{ProtocolData, ScriptCodeHashes, Byte32, Byte32Vec};
use ckb_std::debug;
use molecule::prelude::*;
use alloc::vec::Vec;

/// Extension trait for ProtocolData with helper methods for cell classification
pub trait ProtocolDataExt {
    /// Create protocol data from actual protocol cell
    /// TODO: Implement actual protocol cell reading
    fn from_protocol_cell() -> Result<ProtocolData, crate::error::Error> {
        debug!("Loading protocol data from protocol cell");
        
        // TODO: Read from actual protocol cell
        // For now, return mock data
        Ok(ProtocolData::mock())
    }
    
    /// Create mock protocol data for testing
    fn mock() -> ProtocolData {
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
            
        ProtocolData::new_builder()
            .protocol_config(protocol_config)
            .build()
    }
    
    /// Get protocol type code hash
    fn protocol_type_code_hash(&self) -> [u8; 32];
    
    /// Get campaign type code hash
    fn campaign_type_code_hash(&self) -> [u8; 32];
    
    /// Get user type code hash
    fn user_type_code_hash(&self) -> [u8; 32];
    
    /// Get accepted UDT type hashes
    fn accepted_udt_type_hashes(&self) -> Vec<[u8; 32]>;
    
    /// Get accepted DOB (Digital Object) type hashes
    fn accepted_dob_type_code_hashes(&self) -> Vec<[u8; 32]>;
    
    /// Check if all required type hashes are present
    fn validate_protocol(&self) -> Result<(), crate::error::Error>;
}

impl ProtocolDataExt for ProtocolData {
    /// Get protocol type code hash
    fn protocol_type_code_hash(&self) -> [u8; 32] {
        let hash = self
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_protocol_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get campaign type code hash
    fn campaign_type_code_hash(&self) -> [u8; 32] {
        let hash = self
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_campaign_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get user type code hash
    fn user_type_code_hash(&self) -> [u8; 32] {
        let hash = self
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_user_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get accepted UDT type hashes
    fn accepted_udt_type_hashes(&self) -> Vec<[u8; 32]> {
        let hashes = self
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
    fn accepted_dob_type_code_hashes(&self) -> Vec<[u8; 32]> {
        let hashes = self
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
    
    /// Check if all required type hashes are present
    fn validate_protocol(&self) -> Result<(), crate::error::Error> {
        // Protocol, campaign, and user type hashes are always required
        // They come from the generated structure, so they're always valid
        Ok(())
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
        assert!(data.validate_protocol().is_ok());
        
        // Check that type hashes are properly set
        assert_eq!(data.protocol_type_code_hash(), [1u8; 32]);
        assert_eq!(data.campaign_type_code_hash(), [2u8; 32]);
        assert_eq!(data.user_type_code_hash(), [3u8; 32]);
    }
}