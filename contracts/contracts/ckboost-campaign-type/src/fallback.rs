extern crate alloc;

use ckb_deterministic::{
    debug_trace, transaction_recipe::TransactionRecipeExt
};
use ckboost_shared::{
    error::Error,
    transaction_context::create_transaction_context,
};

use crate::{modules::CKBoostCampaignType, ssri::CKBoostCampaign};

/// Fallback validation implementation for CKBoost Campaign Type
/// This executes when SSRI methods are not yet implemented
pub fn fallback() -> Result<(), Error> {
    debug_trace!("CKBoost Campaign Type: Starting fallback validation");
    
    debug_trace!("Creating transaction context");
    let context = match create_transaction_context() {
        Ok(ctx) => {
            debug_trace!("Transaction context created successfully");
            ctx
        },
        Err(e) => {
            debug_trace!("ERROR: Failed to create transaction context: {:?}", e);
            return Err(e);
        }
    };
    
    debug_trace!("Getting recipe method path");
    let method_path = context.recipe.method_path_bytes();
    debug_trace!("Method path: {:?}", core::str::from_utf8(&method_path).unwrap_or("<invalid UTF-8>"));
    
    let result = match method_path.as_slice() {
        b"CKBoostCampaign.update_campaign" => {
            debug_trace!("Executing verify_update_campaign");
            let verify_result = CKBoostCampaignType::verify_update_campaign(&context);
            debug_trace!("verify_update_campaign result: {:?}", verify_result);
            verify_result
        }
        b"CKBoostCampaign.approve_completion" => {
            debug_trace!("Executing verify_approve_completion");
            let verify_result = CKBoostCampaignType::verify_approve_completion(&context);
            debug_trace!("verify_approve_completion result: {:?}", verify_result);
            verify_result
        }
        _ => {
            debug_trace!("No matching validation rules found for method path: {:?}", core::str::from_utf8(&method_path).unwrap_or("<invalid UTF-8>"));
            Err(Error::SSRIMethodsNotImplemented)
        }
    };
    
    debug_trace!("Fallback validation result: {:?}", result);
    result
}