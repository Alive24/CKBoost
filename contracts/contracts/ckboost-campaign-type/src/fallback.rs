extern crate alloc;

use ckb_deterministic::{
    transaction_recipe::TransactionRecipeExt,
};
use ckboost_shared::{
    error::Error,
    transaction_context::create_transaction_context,
};
use ckb_std::debug;

use crate::recipes;

/// Fallback validation implementation for CKBoost Campaign Type
/// This executes when SSRI methods are not yet implemented
pub fn fallback() -> Result<(), Error> {
    debug!("CKBoost Campaign Type: Starting fallback validation");
    
    // Create transaction context without generic parameter
    let context = create_transaction_context()?;
    debug!("Transaction context created successfully");
    
    // Get the recipe from context
    let recipe = &context.recipe;
    let method_path = recipe.method_path_bytes();
    
    debug!("Method path: {:?}", core::str::from_utf8(&method_path));
    
    // Get the appropriate rules based on method path
    let all_rules = recipes::get_all_rules();
    
    // Find matching rule and validate
    for rules in all_rules {
        // Check if the method path matches the rules' method path
        if rules.method_path == method_path {
            debug!("Found matching rules for method path");
            // Execute validation using the rules
            return rules.validate(&context)
                .map_err(|e| {
                    debug!("Validation failed: {:?}", e);
                    Error::Encoding
                });
        }
    }
    
    debug!("No matching validation rules found for method path");
    Err(Error::SSRIMethodsNotImplemented)
}