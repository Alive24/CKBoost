#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

// Load modules
mod modules;
mod ssri;

// Import Error type at module level
use ckboost_shared::Error;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
// By default, the following heap configuration is used:
// * 16KB fixed heap
// * 1.2MB(rounded up to be 16-byte aligned) dynamic heap
// * Minimal memory block in dynamic heap is 64 bytes
// For more details, please refer to ckb-std's default_alloc macro
// and the buddy-alloc alloc implementation.
ckb_std::default_alloc!(16384, 1258306, 64);

pub fn program_entry() -> i8 {
    use ckb_std::debug;
    use ckboost_shared::transaction_context::create_transaction_context;
    use crate::modules::CKBoostCampaignType;
    use crate::ssri::CKBoostCampaign;
    
    debug!("[Campaign Type] Script entry");
    
    // Create transaction context
    let context = match create_transaction_context() {
        Ok(ctx) => ctx,
        Err(e) => {
            debug!("[Campaign Type] Failed to create context: {:?}", e);
            return e.as_error_code();
        }
    };
    
    // Get method path
    let method_path = context.method_path();
    let method_str = match core::str::from_utf8(&method_path) {
        Ok(s) => s,
        Err(_) => {
            debug!("[Campaign Type] Invalid UTF-8 in method path");
            return Error::SSRIMethodsNotImplemented.as_error_code();
        }
    };
    
    debug!("[Campaign Type] Processing method: {}", method_str);
    
    // Dispatch to appropriate verification method
    let result = match method_str {
        ckboost_shared::ssri::method_paths::CREATE_CAMPAIGN |
        ckboost_shared::ssri::method_paths::UPDATE_CAMPAIGN => {
            CKBoostCampaignType::verify_update_campaign()
        }
        ckboost_shared::ssri::method_paths::COMPLETE_QUEST => {
            CKBoostCampaignType::verify_approve_completion()
        }
        _ => {
            debug!("[Campaign Type] Unknown method: {}", method_str);
            Err(Error::SSRIMethodsNotImplemented)
        }
    };
    
    match result {
        Ok(_) => {
            debug!("[Campaign Type] Script execution successful");
            0
        }
        Err(e) => {
            debug!("[Campaign Type] Script execution failed: {:?}", e);
            e.as_error_code()
        }
    }
}
