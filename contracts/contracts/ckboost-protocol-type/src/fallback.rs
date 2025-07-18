use crate::{modules::CKBoostProtocolType, ssri::CKBoostProtocol};
use ckb_deterministic::{
    transaction_recipe::TransactionRecipeExt,
};
use ckb_std::debug;
use ckboost_shared::{
    transaction_context::create_transaction_context,
    Error,
};

pub fn fallback() -> Result<(), Error> {
    debug!("Entered fallback with ckb_deterministic integration");

    // Create transaction context using ckb_deterministic framework
    let context = create_transaction_context()?;
    debug!("Transaction context created successfully in fallback");

    match context.recipe.method_path_bytes().as_slice() {
        b"CKBoostProtocol.updateProtocol" => {
            CKBoostProtocolType::verify_update_protocol(&context)
        }
        b"CKBoostProtocol.updateTippingProposal" => {
            CKBoostProtocolType::verify_update_tipping_proposal(&context)
        }
        _ => Err(Error::SSRIMethodsNotImplemented)
    }

}
