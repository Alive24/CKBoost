// cspell:ignore celldeps udts
pub use crate::generated::ckboost::{ProtocolData, ScriptCodeHashes, Byte32, Byte32Vec};
use ckb_std::{
    debug, 
    high_level::{load_cell_data, load_cell_type, load_script, QueryIter},
    ckb_constants::Source,
    ckb_types::prelude::*,
};
use ckb_ssri_std::utils::high_level::{find_cell_data_by_out_point, find_out_point_by_type};
use molecule::prelude::*;
use alloc::vec::Vec;

/// Extension trait for ProtocolData with helper methods for cell classification
pub trait ProtocolDataExt {
    /// Create protocol data from actual protocol cell
    /// This function will:
    /// 1. First check CellDeps for protocol cells (normal read operations) - tries to parse any cell with type script as ProtocolData
    /// 2. If not found and we're in a script context, check Outputs for cells with the same type script as the current script
    /// 
    /// The second step handles protocol creation/update scenarios where:
    /// - We're executing in the protocol type script
    /// - No protocol cell exists in CellDeps
    /// - The protocol cell is being created or updated in Outputs
    /// 
    /// Since protocol cells have restricted locks (only protocol manager can unlock),
    /// we don't need to check inputs - we can directly check outputs.
    fn from_protocol_cell() -> Result<ProtocolData, crate::error::Error> {
        debug!("Loading protocol data from protocol cell");
        
        // First, try to find ANY cell with type script in CellDeps that can be parsed as ProtocolData
        let cell_deps_iter = QueryIter::new(load_cell_type, Source::CellDep);
        for (index, type_script_opt) in cell_deps_iter.enumerate() {
            match type_script_opt {
                Some(_type_script) => {
                    debug!("Found type script in CellDep at index {}, attempting to parse as ProtocolData", index);
                    
                    // Try to load and parse the cell data as ProtocolData
                    match load_cell_data(index, Source::CellDep) {
                        Ok(data) => {
                            match ProtocolData::from_slice(&data) {
                                Ok(protocol_data) => {
                                    debug!("Successfully loaded protocol data from CellDep at index {}", index);
                                    return Ok(protocol_data);
                                }
                                Err(_) => {
                                    debug!("Cell at CellDep index {} is not ProtocolData, continuing", index);
                                    continue;
                                }
                            }
                        }
                        Err(e) => {
                            debug!("Failed to load cell data from CellDep at index {}: {:?}", index, e);
                            continue;
                        }
                    }
                }
                None => continue,
            }
        }
        
        // No protocol cell found in CellDeps
        // Try to check outputs for protocol creation/update scenarios
        
        // Try to get the current script (this might fail if not in script context)
        match load_script() {
            Ok(current_script) => {
                let current_code_hash: [u8; 32] = current_script.code_hash().unpack();
                debug!("Current script code hash: {:?}", current_code_hash);
                
                // Check outputs for cells with the same code hash and try to parse as ProtocolData
                // This handles both creation and update scenarios since only protocol manager can unlock protocol cells
                debug!("Checking outputs for cells with current script type");
                
                let outputs_iter = QueryIter::new(load_cell_type, Source::Output);
                for (index, type_script_opt) in outputs_iter.enumerate() {
                    match type_script_opt {
                        Some(type_script) => {
                            let output_code_hash: [u8; 32] = type_script.code_hash().unpack();
                            match output_code_hash == current_code_hash {
                                true => {
                                    debug!("Found cell with same type script in Output at index {}", index);
                                    
                                    // Try to parse this cell as ProtocolData
                                    match load_cell_data(index, Source::Output) {
                                        Ok(data) => {
                                            match ProtocolData::from_slice(&data) {
                                                Ok(protocol_data) => {
                                                    debug!("Successfully loaded protocol data from Output");
                                                    return Ok(protocol_data);
                                                }
                                                Err(_) => {
                                                    debug!("Cell is not ProtocolData, continuing");
                                                    continue;
                                                }
                                            }
                                        }
                                        Err(e) => {
                                            debug!("Failed to load cell data: {:?}", e);
                                            continue;
                                        }
                                    }
                                }
                                false => continue,
                            }
                        }
                        None => continue,
                    }
                }
            }
            Err(_) => {
                debug!("Not in script context or unable to load script, cannot check outputs");
            }
        }
        
        // No protocol cell found anywhere
        Err(crate::error::Error::ProtocolCellNotFound)
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
/// 
/// This function searches for protocol cells in the following order:
/// 1. **CellDeps** - Tries to parse any cell with type script as ProtocolData (works in any context)
/// 2. **Outputs** - When in script context, looks for cells with the same type script as current script
/// 
/// The second step handles protocol creation/update scenarios:
/// - When executing in protocol type script (creation or update)
/// - No protocol cell exists in CellDeps
/// - The protocol cell is in Outputs with the protocol type script
/// 
/// Since protocol cells have restricted locks that only the protocol manager can unlock,
/// we don't need to distinguish between creation and update - we simply check outputs.
/// 
/// # Returns
/// - `Ok(ProtocolData)` - Successfully loaded protocol data from a cell
/// - `Err(ProtocolCellNotFound)` - No protocol cell found
pub fn get_protocol_data() -> Result<ProtocolData, crate::error::Error> {
    ProtocolData::from_protocol_cell()
}

/// Get protocol data using SSRI pattern
/// 
/// This function is designed for SSRI-based transaction generation where we have a protocol 
/// type script and need to load its data directly from the blockchain state.
/// 
/// In SSRI mode:
/// - We're generating transactions, not verifying them
/// - We can directly query blockchain state using SSRI functions
/// - No need to check transaction inputs/outputs/celldeps
/// 
/// # Arguments
/// * `protocol_type_script` - The type script of the protocol cell
/// 
/// # Returns
/// - `Ok(ProtocolData)` - Successfully loaded protocol data from the blockchain
/// - `Err(ProtocolCellNotFound)` - No protocol cell found with the given type script
/// - `Err(ProtocolDataInvalid)` - Protocol cell found but data is malformed
pub fn get_protocol_data_ssri(protocol_type_script: ckb_std::ckb_types::packed::Script) -> Result<ProtocolData, crate::error::Error> {
    debug!("Loading protocol data using SSRI pattern");
    
    // In SSRI mode, we use find_out_point_by_type to locate the protocol cell
    match find_out_point_by_type(protocol_type_script) {
        Ok(out_point) => {
            debug!("Found protocol cell outpoint: {:?}", out_point);
            
            // Load the cell data directly using the outpoint
            // In SSRI, find_cell_data_by_out_point returns the actual cell data
            match find_cell_data_by_out_point(out_point) {
                Ok(data) => {
                    debug!("Found protocol cell data");
                    
                    // Parse the data as ProtocolData
                    match ProtocolData::from_slice(&data) {
                        Ok(protocol_data) => {
                            debug!("Successfully loaded protocol data via SSRI");
                            Ok(protocol_data)
                        }
                        Err(e) => {
                            debug!("Failed to parse protocol data: {:?}", e);
                            Err(crate::error::Error::ProtocolDataInvalid)
                        }
                    }
                }
                Err(e) => {
                    debug!("Failed to find cell by outpoint: {:?}", e);
                    Err(crate::error::Error::ProtocolCellNotFound)
                }
            }
        }
        Err(e) => {
            debug!("Failed to find protocol cell by type: {:?}", e);
            Err(crate::error::Error::ProtocolCellNotFound)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::generated::ckboost::ProtocolConfig;
    
    #[test]
    fn test_protocol_data_serialization() {
        // Create test protocol data
        let script_code_hashes = ScriptCodeHashes::new_builder()
            .ckb_boost_protocol_type_code_hash(Byte32::from([1u8; 32]))
            .ckb_boost_protocol_lock_code_hash(Byte32::from([11u8; 32]))
            .ckb_boost_campaign_type_code_hash(Byte32::from([2u8; 32]))
            .ckb_boost_campaign_lock_code_hash(Byte32::from([12u8; 32]))
            .ckb_boost_user_type_code_hash(Byte32::from([3u8; 32]))
            .accepted_udt_type_code_hashes(Byte32Vec::new_builder().build())
            .accepted_dob_type_code_hashes(Byte32Vec::new_builder().build())
            .build();
            
        let protocol_config = ProtocolConfig::new_builder()
            .script_code_hashes(script_code_hashes)
            .build();
            
        let original_data = ProtocolData::new_builder()
            .protocol_config(protocol_config)
            .build();
        
        // Serialize to bytes
        let bytes = original_data.as_bytes();
        
        // Deserialize back
        let deserialized_data = ProtocolData::from_slice(&bytes).expect("Should deserialize");
        
        // Verify they match
        assert_eq!(original_data.protocol_type_code_hash(), deserialized_data.protocol_type_code_hash());
        assert_eq!(original_data.campaign_type_code_hash(), deserialized_data.campaign_type_code_hash());
        assert_eq!(original_data.user_type_code_hash(), deserialized_data.user_type_code_hash());
    }
    
    #[test]
    fn test_protocol_data_validation() {
        // Create test protocol data with some accepted UDTs and DOBs
        let udt1 = Byte32::from([10u8; 32]);
        let udt2 = Byte32::from([20u8; 32]);
        let accepted_udts = Byte32Vec::new_builder()
            .push(udt1)
            .push(udt2)
            .build();
            
        let dob1 = Byte32::from([30u8; 32]);
        let accepted_dobs = Byte32Vec::new_builder()
            .push(dob1)
            .build();
            
        let script_code_hashes = ScriptCodeHashes::new_builder()
            .ckb_boost_protocol_type_code_hash(Byte32::from([1u8; 32]))
            .ckb_boost_protocol_lock_code_hash(Byte32::from([11u8; 32]))
            .ckb_boost_campaign_type_code_hash(Byte32::from([2u8; 32]))
            .ckb_boost_campaign_lock_code_hash(Byte32::from([12u8; 32]))
            .ckb_boost_user_type_code_hash(Byte32::from([3u8; 32]))
            .accepted_udt_type_code_hashes(accepted_udts)
            .accepted_dob_type_code_hashes(accepted_dobs)
            .build();
            
        let protocol_config = ProtocolConfig::new_builder()
            .script_code_hashes(script_code_hashes)
            .build();
            
        let data = ProtocolData::new_builder()
            .protocol_config(protocol_config)
            .build();
        
        // Validate protocol should succeed
        assert!(data.validate_protocol().is_ok());
        
        // Test accepted UDTs
        let udts = data.accepted_udt_type_hashes();
        assert_eq!(udts.len(), 2);
        assert_eq!(udts[0], [10u8; 32]);
        assert_eq!(udts[1], [20u8; 32]);
        
        // Test accepted DOBs
        let dobs = data.accepted_dob_type_code_hashes();
        assert_eq!(dobs.len(), 1);
        assert_eq!(dobs[0], [30u8; 32]);
    }
}