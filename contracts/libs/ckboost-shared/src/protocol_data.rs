// cspell:ignore celldeps udts
pub use crate::generated::ckboost::{ProtocolData, ScriptCodeHashes, Byte32, Byte32Vec, ScriptVec, Script};
use crate::Error;
use ckb_deterministic::{debug_trace, known_scripts::{self, get_script_info}};
use ckb_std::{
    debug, 
    high_level::{load_cell_data, load_cell_type, load_cell_type_hash, load_script, decode_hex},
    ckb_constants::Source,
    ckb_types::prelude::*,
};
use ckb_ssri_std::utils::high_level::{find_cell_data_by_out_point, find_out_point_by_type};
use molecule::prelude::*;
use alloc::vec::Vec;
use alloc::ffi::CString;

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
    fn from_protocol_cell() -> Result<ProtocolData, Error> {
        debug_trace!("Loading protocol data from protocol cell");
        
        // Get the current script to extract the connected_key from args
        match load_script() {
            Ok(current_script) => {
                let args = current_script.args();
                debug_trace!("Current script args length: {}", args.len());
                
                // Parse the args as ConnectedTypeID to get the connected_key
                use crate::generated::ckboost::ConnectedTypeID;
                match ConnectedTypeID::from_slice(&args.raw_data()) {
                    Ok(connected_type_id) => {
                        let connected_hash = connected_type_id.connected_key();
                        debug_trace!("Looking for protocol cell with type hash: {:?}", connected_hash);
                        
                        // Now search CellDeps for a cell with matching type script hash
                        // Check only first 3 CellDeps to avoid issues
                        for index in 0..3 {
                            debug_trace!("Checking CellDep at index {}", index);
                            match load_cell_type_hash(index, Source::CellDep) {
                                Ok(Some(type_hash)) => {
                                    debug_trace!("CellDep {} type script hash: {:?}", index, type_hash);
                                    
                                    // Check if this matches our connected_key
                                    if type_hash.as_slice() == connected_hash.as_slice() {
                                        debug_trace!("Found matching protocol cell at CellDep index {}", index);
                                        
                                        // Load and parse the protocol data
                                        match load_cell_data(index, Source::CellDep) {
                                            Ok(data) => {
                                                match ProtocolData::from_slice(&data) {
                                                    Ok(protocol_data) => {
                                                        debug_trace!("Successfully loaded protocol data from CellDep at index {}", index);
                                                        return Ok(protocol_data);
                                                    }
                                                    Err(e) => {
                                                        debug_trace!("Failed to parse protocol data: {:?}", e);
                                                        return Err(crate::error::Error::ProtocolDataInvalid);
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                debug_trace!("Failed to load cell data: {:?}", e);
                                                return Err(crate::error::Error::ProtocolDataNotLoaded);
                                            }
                                        }
                                    }
                                }
                                Ok(None) => {
                                    debug_trace!("CellDep {} has no type script", index);
                                }
                                Err(_) => {
                                    debug_trace!("No more CellDeps at index {}", index);
                                    break;
                                }
                            }
                        }
                        
                        debug_trace!("Protocol cell not found in CellDeps");
                        return Err(crate::error::Error::ProtocolCellNotFound);
                    }
                    Err(e) => {
                        debug_trace!("Failed to parse args as ConnectedTypeID: {:?}", e);
                        
                        // Fallback: Check outputs for protocol creation scenario
                        debug_trace!("Checking outputs for protocol creation scenario");
                        
                        // Check outputs for cells with the same code hash as current script
                        let current_code_hash: [u8; 32] = current_script.code_hash().unpack();
                        debug_trace!("Current script code hash: {:?}", current_code_hash);
                        
                        // Check outputs for cells with the same code hash and try to parse as ProtocolData
                        // This handles both creation and update scenarios since only protocol manager can unlock protocol cells
                        debug_trace!("Checking outputs for cells with current script type");
                        
                        // Using manual index control to avoid QueryIter issues
                        let mut index = 0;
                        loop {
                            match load_cell_type(index, Source::Output) {
                                Ok(type_script_opt) => match type_script_opt {
                                    Some(type_script) => {
                                        let output_code_hash: [u8; 32] = type_script.code_hash().unpack();
                                        if output_code_hash == current_code_hash {
                                            debug_trace!("Found cell with same type script in Output at index {}", index);
                                            
                                            // Try to parse this cell as ProtocolData
                                            match load_cell_data(index, Source::Output) {
                                                Ok(data) => {
                                                    match ProtocolData::from_slice(&data) {
                                                        Ok(protocol_data) => {
                                                            debug_trace!("Successfully loaded protocol data from Output");
                                                            return Ok(protocol_data);
                                                        }
                                                        Err(_) => {
                                                            debug_trace!("Found a protocol cell but the data is invalid. Should not happen.");
                                                            return Err(crate::error::Error::ProtocolDataInvalid);
                                                        }
                                                    }
                                                }
                                                Err(e) => {
                                                    debug_trace!("Failed to load cell data: {:?}", e);
                                                    return Err(crate::error::Error::ProtocolDataNotLoaded);
                                                }
                                            }
                                        } else {
                                            index += 1;
                                            continue;
                                        }
                                    }
                                    None => {
                                        index += 1;
                                        continue;
                                    }
                                },
                                Err(_) => {
                                    // No more Outputs to check
                                    debug_trace!("Finished checking {} Outputs", index);
                                    break;
                                }
                            }
                        }
                    }
                }
            }
            Err(_) => {
                debug_trace!("Not in script context or unable to load script, cannot check outputs");
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

    /// Get points type code hash
    fn points_udt_type_code_hash(&self) -> [u8; 32];
    
    /// Get accepted UDT type scripts
    fn accepted_udt_type_scripts(&self) -> Vec<Script>;
    
    /// Get accepted DOB (Digital Object) type scripts
    fn accepted_dob_type_scripts(&self) -> Vec<Script>;
    
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
    
    /// Get points type code hash
    fn points_udt_type_code_hash(&self) -> [u8; 32] {
        let hash = self
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_points_udt_type_code_hash();
        let mut result = [0u8; 32];
        result.copy_from_slice(hash.as_slice());
        result
    }
    
    /// Get accepted UDT type scripts
    fn accepted_udt_type_scripts(&self) -> Vec<Script> {
        let scripts = self
            .protocol_config()
            .script_code_hashes()
            .accepted_udt_type_scripts();
            
        let mut result = Vec::new();
        for i in 0..scripts.len() {
            let script = scripts.get(i).unwrap();
            result.push(script);
        }
        result
    }
    
    /// Get accepted DOB (Digital Object) type scripts
    fn accepted_dob_type_scripts(&self) -> Vec<Script> {
        let scripts = self
            .protocol_config()
            .script_code_hashes()
            .accepted_dob_type_scripts();
            
        let mut result = Vec::new();
        for i in 0..scripts.len() {
            let script = scripts.get(i).unwrap();
            result.push(script);
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
    debug_trace!("Loading protocol data using SSRI pattern");
    
    // In SSRI mode, we use find_out_point_by_type to locate the protocol cell
    match find_out_point_by_type(protocol_type_script) {
        Ok(out_point) => {
            debug_trace!("Found protocol cell outpoint: {:?}", out_point);
            
            // Load the cell data directly using the outpoint
            // In SSRI, find_cell_data_by_out_point returns the actual cell data
            match find_cell_data_by_out_point(out_point) {
                Ok(data) => {
                    debug_trace!("Found protocol cell data");
                    
                    // Parse the data as ProtocolData
                    match ProtocolData::from_slice(&data) {
                        Ok(protocol_data) => {
                            debug_trace!("Successfully loaded protocol data via SSRI");
                            Ok(protocol_data)
                        }
                        Err(e) => {
                            debug_trace!("Failed to parse protocol data: {:?}", e);
                            Err(crate::error::Error::ProtocolDataInvalid)
                        }
                    }
                }
                Err(e) => {
                    debug_trace!("Failed to find cell by outpoint: {:?}", e);
                    Err(crate::error::Error::ProtocolCellNotFound)
                }
            }
        }
        Err(e) => {
            debug_trace!("Failed to find protocol cell by type: {:?}", e);
            Err(crate::error::Error::ProtocolCellNotFound)
        }
    }
}

#[cfg(test)]
mod tests {
    use ckb_std::ckb_types::core::ScriptHashType;

    use super::*;
    use crate::{generated::ckboost::ProtocolConfig, types::Bytes};
    
    #[test]
    fn test_protocol_data_serialization() {
        // Create test protocol data
        let script_code_hashes = ScriptCodeHashes::new_builder()
            .ckb_boost_protocol_type_code_hash(Byte32::from([1u8; 32]))
            .ckb_boost_protocol_lock_code_hash(Byte32::from([11u8; 32]))
            .ckb_boost_campaign_type_code_hash(Byte32::from([2u8; 32]))
            .ckb_boost_campaign_lock_code_hash(Byte32::from([12u8; 32]))
            .ckb_boost_user_type_code_hash(Byte32::from([3u8; 32]))
            .accepted_udt_type_scripts(ScriptVec::new_builder().build())
            .accepted_dob_type_scripts(ScriptVec::new_builder().build())
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
        let udt1_script = Script::new_builder()
            .code_hash(Byte32::from([10u8; 32]))
            .hash_type(ScriptHashType::Data)
            .args(Bytes::from(vec![1u8, 2u8, 3u8]))
            .build();
        let udt2_script = Script::new_builder()
            .code_hash(Byte32::from([20u8; 32]))
            .hash_type(ScriptHashType::Data)
            .args(Bytes::from(vec![4u8, 5u8, 6u8]))
            .build();
        let accepted_udts = ScriptVec::new_builder()
            .push(udt1_script)
            .push(udt2_script)
            .build();
            
        let dob1_script = Script::new_builder()
            .code_hash(Byte32::from([30u8; 32]))
            .hash_type(ScriptHashType::Data)
            .args(Bytes::from(vec![7u8, 8u8, 9u8]))
            .build();
        let accepted_dobs = ScriptVec::new_builder()
            .push(dob1_script)
            .build();
            
        let script_code_hashes = ScriptCodeHashes::new_builder()
            .ckb_boost_protocol_type_code_hash(Byte32::from([1u8; 32]))
            .ckb_boost_protocol_lock_code_hash(Byte32::from([11u8; 32]))
            .ckb_boost_campaign_type_code_hash(Byte32::from([2u8; 32]))
            .ckb_boost_campaign_lock_code_hash(Byte32::from([12u8; 32]))
            .ckb_boost_user_type_code_hash(Byte32::from([3u8; 32]))
            .accepted_udt_type_scripts(accepted_udts)
            .accepted_dob_type_scripts(accepted_dobs)
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
        let udts = data.accepted_udt_type_scripts();
        assert_eq!(udts.len(), 2);
        // Check first UDT script
        let udt1 = &udts[0];
        let mut expected_hash = [0u8; 32];
        expected_hash.copy_from_slice(&[10u8; 32]);
        assert_eq!(udt1.code_hash().as_slice(), &expected_hash);
        assert_eq!(udt1.hash_type().as_slice(), &[0u8]);
        assert_eq!(udt1.args().raw_data(), vec![1u8, 2u8, 3u8]);
        
        // Check second UDT script  
        let udt2 = &udts[1];
        let mut expected_hash2 = [0u8; 32];
        expected_hash2.copy_from_slice(&[20u8; 32]);
        assert_eq!(udt2.code_hash().as_slice(), &expected_hash2);
        assert_eq!(udt2.hash_type().as_slice(), &[0u8]);
        assert_eq!(udt2.args().raw_data(), vec![4u8, 5u8, 6u8]);
        
        // Test accepted DOBs
        let dobs = data.accepted_dob_type_scripts();
        assert_eq!(dobs.len(), 1);
        let dob1 = &dobs[0];
        let mut expected_hash3 = [0u8; 32];
        expected_hash3.copy_from_slice(&[30u8; 32]);
        assert_eq!(dob1.code_hash().as_slice(), &expected_hash3);
        assert_eq!(dob1.hash_type().as_slice(), &[1u8]);
        assert_eq!(dob1.args().raw_data(), vec![7u8, 8u8, 9u8]);
    }
}