extern crate alloc;

use ckb_deterministic::{
    transaction_recipe::TransactionRecipeExt,
};
use ckboost_shared::{
    error::Error,
    transaction_context::create_transaction_context,
};
use ckb_std::debug;

use crate::{modules::CKBoostUserType, ssri::CKBoostUser};

/// Fallback validation implementation for CKBoost User Type
/// This executes when SSRI methods are not yet implemented
pub fn fallback() -> Result<(), Error> {
    debug!("CKBoost User Type: Starting fallback validation");
    
    let context = create_transaction_context()?;
    
    match context.recipe.method_path_bytes().as_slice() {
        b"CKBoostUser.submit_quest" => {
            CKBoostUserType::verify_submit_quest(&context)
        }
        b"CKBoostUser.update_user_verification" => {
            CKBoostUserType::verify_update_user_verification()
        }
        b"CKBoostUser.update_user" => {
            CKBoostUserType::verify_update_user(&context)
        }
        _ => {
            debug!("No matching validation rules found for method path");
            Err(Error::SSRIMethodsNotImplemented)
        }
    }
}