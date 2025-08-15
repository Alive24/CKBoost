extern crate alloc;

use ckb_deterministic::{
    transaction_recipe::TransactionRecipeExt,
};
use ckboost_shared::{
    error::Error,
    transaction_context::create_transaction_context,
};
use ckb_std::debug;

use crate::{modules::CKBoostCampaignType, ssri::CKBoostCampaign};

/// Fallback validation implementation for CKBoost Campaign Type
/// This executes when SSRI methods are not yet implemented
pub fn fallback() -> Result<(), Error> {
    debug!("CKBoost Campaign Type: Starting fallback validation");
    
    let context = create_transaction_context()?;
    
    let result = match context.recipe.method_path_bytes().as_slice() {
        b"CKBoostCampaign.update_campaign" => {
            debug!("Executing verify_update_campaign");
            let verify_result = CKBoostCampaignType::verify_update_campaign(&context);
            debug!("verify_update_campaign result: {:?}", verify_result);
            verify_result
        }
        b"CKBoostCampaign.approve_completion" => {
            debug!("Executing verify_approve_completion");
            let verify_result = CKBoostCampaignType::verify_approve_completion(&context);
            debug!("verify_approve_completion result: {:?}", verify_result);
            verify_result
        }
        _ => {
            debug!("No matching validation rules found for method path");
            Err(Error::SSRIMethodsNotImplemented)
        }
    };
    
    debug!("Fallback validation result: {:?}", result);
    result
}