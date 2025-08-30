#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use ckb_deterministic::{debug_info, debug_trace};
use ckb_std::{ckb_types::packed::Byte32Vec, high_level::load_script};
use ckboost_shared::Error;
use ckb_ssri_std::utils::should_fallback;
use ckb_ssri_std_proc_macro::ssri_methods;
use ckb_std::syscalls::{pipe, write};
use molecule::prelude::Entity;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

#[cfg(not(feature = "library"))]
pub mod ssri;
#[cfg(not(feature = "library"))]
pub mod modules;
#[cfg(not(feature = "library"))]
pub mod recipes;
#[cfg(not(feature = "library"))]
pub mod fallback;

use crate::{fallback::fallback, ssri::CKBoostCampaign};

fn program_entry_wrap() -> Result<(), Error> {
    let argv = ckb_std::env::argv();

    if should_fallback()? {
        debug_trace!("Should fallback!");
        // # Validation Rules for Lock Script
        // 
        // 1. **Dual unlock mechanism**: 
        //    - Campaign admin can unlock (when campaign cell is being spent)
        //    - Approved user can unlock (with approval proof in transaction)
        debug_trace!("Loading lock script for validation");
        let script = load_script()?;
        debug_trace!("Lock script loaded successfully");
        
        let args = script.args();
        let args_raw = args.raw_data();
        debug_info!("Lock script args length: {} bytes", args_raw.len());
        
        // Lock args should contain at least the campaign type ID (32 bytes)
        if args_raw.len() < 32 {
            debug_info!("ERROR: Invalid args length for campaign type ID. Expected at least 32, got {}", args_raw.len());
            return Err(Error::InvalidArgument);
        }
        
        // The lock args contain the campaign type_id that this lock is associated with
        let campaign_type_id = &args_raw[0..32];
        debug_info!("Campaign type ID from lock args: {:?}", campaign_type_id);
        
        // Call fallback to handle the actual validation
        debug_trace!("Calling fallback for lock validation");
        fallback()?;
        
        return Ok(());
    }

    debug_trace!("Entering SSRI methods for CKBoost Campaign Lock");
    
    // For lock scripts, we typically don't have SSRI methods that build transactions
    // The lock script mainly validates unlock conditions
    // However, we can still support SSRI methods if needed for future extensions
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        // Currently no SSRI methods implemented for lock script
        // Lock scripts typically don't build transactions, they just validate
        // The actual transaction building happens in the type script (campaign-type)
    )?;
    
    let pipe = pipe()?;
    write(pipe.1, &res)?;
    Ok(())
}

pub fn program_entry() -> i8 {
    match program_entry_wrap() {
        Ok(_) => 0,
        Err(err) => {
            debug_trace!("Lock script execution failed with error: {:?}", err);
            err as i8
        }
    }
}
