use ckboost_shared::{
    Error,
    transaction_recipe::{parse_transaction_recipe, get_method_path, get_arguments},
    ssri::{method_paths, ArgumentDecoder}
};
use ckb_std::debug;
use crate::{modules::CKBoostProtocolType, ssri::CKBoostProtocol};

/// Dispatch method call based on method path
fn dispatch_method(method_path: &[u8], arguments: &[Vec<u8>]) -> Result<(), Error> {
    let _decoder = ArgumentDecoder::new(arguments);
    
    match method_path {
        path if path == method_paths::UPDATE_PROTOCOL => {
            debug!("Calling verify_update_protocol");
            CKBoostProtocolType::verify_update_protocol()
        }
        path if path == method_paths::UPDATE_TIPPING_PROPOSAL => {
            debug!("Calling verify_update_tipping_proposal");
            CKBoostProtocolType::verify_update_tipping_proposal()
        }
        _ => {
            debug!("Unknown method path: {:?}", method_path);
            Err(Error::SSRIMethodsNotImplemented)
        }
    }
}

pub fn fallback() -> Result<(), Error> {
    debug!("Entered fallback");
    
    // Parse transaction recipe from witness
    let recipe = match parse_transaction_recipe()? {
        Some(recipe) => recipe,
        None => {
            debug!("No transaction recipe found in witness");
            return Err(Error::SSRIMethodsNotFound);
        }
    };
    
    debug!("Transaction recipe found");
    
    // Get method path and arguments
    let method_path = get_method_path(&recipe)?;
    let arguments = get_arguments(&recipe);
    
    debug!("Method path: {:?}", method_path);
    debug!("Arguments count: {}", arguments.len());
    
    // Dispatch based on method path
    dispatch_method(&method_path, &arguments)
}