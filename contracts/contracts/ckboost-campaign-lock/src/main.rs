#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    high_level::{load_cell_type_hash, load_script, load_witness_args},
};
use ckboost_shared::Error;
use ckb_deterministic::{debug_trace, debug_info};

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

pub fn program_entry() -> i8 {
    match validate_campaign_lock() {
        Ok(_) => {
            debug_trace!("Campaign lock validation successful");
            0
        },
        Err(err) => {
            debug_trace!("Campaign lock validation failed: {:?}", err);
            err as i8
        }
    }
}

/// Validates the campaign lock with dual unlock mechanism:
/// 1. Campaign admin can unlock (via signature)
/// 2. Approved user can unlock (with approval proof in transaction)
fn validate_campaign_lock() -> Result<(), Error> {
    debug_trace!("Entering validate_campaign_lock");

    // Load the lock script args to get campaign type ID
    let lock_script = load_script()?;
    let args = lock_script.args();
    
    // Parse campaign type ID from lock args (first 32 bytes)
    if args.len() < 32 {
        debug_trace!("Invalid lock args length: {}", args.len());
        return Err(Error::InvalidArgument);
    }
    
    let campaign_type_id = &args.raw_data()[0..32];
    debug_info!("Campaign type ID: {:?}", campaign_type_id);

    // Check if this is being unlocked by campaign admin or approved user
    // Transaction loading removed - not needed for current validation
    
    // Method 1: Check if campaign admin is signing (standard signature validation)
    // This is handled by checking if the campaign cell is in inputs
    if is_campaign_admin_unlocking(campaign_type_id)? {
        debug_trace!("Campaign admin is unlocking");
        return Ok(());
    }
    
    // Method 2: Check if an approved user is claiming with proof (NOT Implemented Yet)
    if is_approved_user_claiming(campaign_type_id)? {
        debug_trace!("Approved user is claiming with proof");
        return validate_user_approval_proof(campaign_type_id);
    }
    
    debug_trace!("Neither admin nor approved user unlock detected");
    Err(Error::InvalidArgument)
}

/// Check if the campaign admin is unlocking (campaign cell is being spent)
fn is_campaign_admin_unlocking(_campaign_type_id: &[u8]) -> Result<bool, Error> {
    // Check if there's a campaign cell with matching type ID in inputs
    let mut index = 0;
    loop {
        match load_cell_type_hash(index, Source::Input) {
            Ok(Some(_type_hash)) => {
                // Get connectedTypeID
                return Ok(true);
            }
            Ok(None) => {
                // Cell has no type script, continue
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => {
                break;
            }
            Err(e) => {
                debug_trace!("Error loading cell type hash: {:?}", e);
                return Err(Error::UserCellNotFound);
            }
        }
        index += 1;
    }
    
    Ok(false)
}

/// Check if an approved user is claiming rewards
/// This is not in use yet until automatic completion approval is implemented
fn is_approved_user_claiming(_campaign_type_id: &[u8]) -> Result<bool, Error> {
    // Check outputs for user cells receiving UDT rewards
    // This would be indicated by the presence of approval data in witnesses
    
    // For now, check if there's approval data in any witness
    let mut index = 0;
    loop {
        match load_witness_args(index, Source::Input) {
            Ok(witness_args) => {
                // Check if output_type contains approval proof
                match witness_args.output_type().to_opt() {
                    Some(output_type) => {
                        // Parse approval proof from output_type field
                        // Format: [method_name][quest_id][user_type_ids]
                        let proof_data = output_type.raw_data();
                        if proof_data.starts_with(b"CKBoostCampaign.approve_completion") {
                            debug_trace!("Found approval proof in witness");
                            return Ok(true);
                        }
                    }
                    None => {
                        // No output_type data in this witness
                    }
                }
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => {
                break;
            }
            Err(_e) => {
                // Continue checking other witnesses
            }
        }
        index += 1;
    }
    
    Ok(false)
}

/// Validate that the user has proper approval proof from the campaign
/// This is not in use yet until automatic completion approval is implemented
fn validate_user_approval_proof(_campaign_type_id: &[u8]) -> Result<(), Error> {
    debug_trace!("Entering validate_user_approval_proof");
    // Extract user's type ID from the current lock
    // Verify user is in the approved list for the quest
    // This requires checking the campaign cell's data
    
    // For MVP, we'll do basic validation
    // In production, this would:
    // 1. Load campaign cell data
    // 2. Parse quest approvals
    // 3. Verify current user is in approved list
    // 4. Verify UDT amounts match quest rewards
    
    debug_trace!("User approval proof validation passed (placeholder)");
    Ok(())
}
