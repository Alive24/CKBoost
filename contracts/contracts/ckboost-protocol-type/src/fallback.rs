use crate::{modules::CKBoostProtocolType, ssri::CKBoostProtocol};
use ckb_std::debug;
use ckboost_shared::{
    ssri::{method_paths, ArgumentDecoder},
    transaction_context::{create_transaction_context, CKBoostTransactionContext},
    transaction_recipe::{get_arguments, get_method_path, parse_transaction_recipe},
    Error,
};
use molecule::prelude::*;

/// Dispatch method call based on method path using ckb_deterministic transaction context
fn dispatch_method(
    context: &CKBoostTransactionContext,
    method_path: &[u8],
    arguments: &[Vec<u8>],
) -> Result<(), Error> {
    let _decoder = ArgumentDecoder::new(arguments);

    // Convert method path bytes to string for comparison
    let method_str = match core::str::from_utf8(method_path) {
        Ok(s) => s,
        Err(_) => {
            debug!("Invalid UTF-8 in method path: {:?}", method_path);
            return Err(Error::SSRIMethodsNotImplemented);
        }
    };

    debug!(
        "Dispatching method: {} with {} arguments",
        method_str,
        arguments.len()
    );

    // Validate transaction context first using ckb_deterministic framework
    context.validate_with_ckboost_rules()?;
    debug!("Transaction context validation passed in fallback mode");

    match method_str {
        method_paths::UPDATE_PROTOCOL => {
            debug!("Calling verify_update_protocol with enhanced validation");
            // The verify method will create its own context, but we've already validated here
            CKBoostProtocolType::verify_update_protocol()
        }
        method_paths::UPDATE_TIPPING_PROPOSAL => {
            debug!("Calling verify_update_tipping_proposal with enhanced validation");
            // The verify method will create its own context, but we've already validated here
            CKBoostProtocolType::verify_update_tipping_proposal()
        }
        _ => {
            debug!("Unknown method path: {}", method_str);
            Err(Error::SSRIMethodsNotImplemented)
        }
    }
}

pub fn fallback() -> Result<(), Error> {
    debug!("Entered fallback with ckb_deterministic integration");

    // Create transaction context using ckb_deterministic framework
    let context = create_transaction_context()?;
    debug!("Transaction context created successfully in fallback");

    // Get method path and arguments from context
    let method_path = context.method_path();
    let arguments = context.arguments();

    debug!("Method path: {:?}", method_path);
    debug!("Arguments count: {}", arguments.len());

    // Log transaction summary for debugging
    let summary = context.summary();
    debug!(
        "Transaction summary - Method path length: {}, Arguments: {}, Total cells: {}",
        summary.method_path_length,
        summary.argument_count,
        summary.identified_cell_count()
    );

    // Dispatch based on method path with full context
    dispatch_method(&context, &method_path, arguments)
}
