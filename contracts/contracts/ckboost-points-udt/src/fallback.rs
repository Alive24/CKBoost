use ckboost_shared::Error;
use crate::utils::{is_minting_operation, validate_protocol_owner_mode, validate_udt_rules};
use ckb_std::{
    ckb_types::{bytes::Bytes, prelude::*},
    debug,
    high_level::load_script,
};

/// Fallback function for standard type script validation
/// This is called when not running in SSRI mode
pub fn fallback() -> Result<(), Error> {
    debug!("Points UDT fallback validation");
    
    // Get protocol type hash from Points UDT args
    let script = load_script().map_err(|_| Error::ItemMissing)?;
    let args: Bytes = script.args().unpack();
    
    if args.len() != 32 {
        debug!("Invalid args length: expected 32 bytes for protocol type hash, got {}", args.len());
        return Err(Error::InvalidArgument);
    }
    
    let protocol_type_hash = args.as_ref();
    
    // Check if this is a minting operation
    if is_minting_operation()? {
        debug!("Minting operation detected, validating protocol owner mode");
        validate_protocol_owner_mode(protocol_type_hash)?;
    }
    
    // Standard UDT validation (balance checks)
    validate_udt_rules()?;
    
    debug!("Points UDT validation successful");
    Ok(())
}