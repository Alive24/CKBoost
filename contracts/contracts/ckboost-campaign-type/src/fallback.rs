extern crate alloc;

use ckb_deterministic::{
    transaction_recipe::TransactionRecipeExt,
};
use ckboost_shared::{
    error::Error,
    transaction_context::create_transaction_context,
};
use ckb_std::debug;

use crate::{modules::CKBoostCampaignType, recipes, ssri::CKBoostCampaign};

/// Fallback validation implementation for CKBoost Campaign Type
/// This executes when SSRI methods are not yet implemented
pub fn fallback() -> Result<(), Error> {
    debug!("CKBoost Campaign Type: Starting fallback validation");
    
    let context = create_transaction_context()?;
    
    match context.recipe.method_path_bytes().as_slice() {
        b"CKBoostCampaign.updateCampaign" => {
            CKBoostCampaignType::verify_update_campaign(&context)
        }
        _ => {
            debug!("No matching validation rules found for method path");
            Err(Error::SSRIMethodsNotImplemented)
        }
    }
}