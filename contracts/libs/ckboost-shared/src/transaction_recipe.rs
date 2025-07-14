// CKBoost-specific transaction recipe implementation using ckb_deterministic
use crate::error::Error;
use ckb_deterministic::generated::TransactionRecipe;
use ckb_deterministic::transaction_recipe::{
    self as recipe, 
    TransactionRecipeExt,
    create_transaction_recipe
};
use alloc::vec::Vec;

/// CKBoost-specific wrapper around the unified transaction recipe
#[derive(Debug)]
pub struct CKBoostTransactionRecipe {
    inner: TransactionRecipe,
}

impl CKBoostTransactionRecipe {
    pub fn new(recipe: TransactionRecipe) -> Self {
        Self { inner: recipe }
    }
    
    pub fn inner(&self) -> &TransactionRecipe {
        &self.inner
    }
    
    /// Get method path as bytes
    pub fn method_path(&self) -> Vec<u8> {
        self.inner.method_path_bytes()
    }
    
    /// Get arguments as vector of byte vectors
    pub fn arguments(&self) -> Vec<Vec<u8>> {
        self.inner.arguments_vec()
    }
    
    /// Check if the method path matches expected value
    pub fn matches_method_path(&self, expected_path: &[u8]) -> bool {
        self.method_path().as_slice() == expected_path
    }
}

/// Parse CKBoost transaction recipe from the last witness item using ckb_deterministic
/// Returns None if no witnesses exist or parsing fails
pub fn parse_transaction_recipe() -> Result<Option<CKBoostTransactionRecipe>, Error> {
    let recipe = recipe::parse_transaction_recipe()
        .map_err(|e| match e {
            ckb_deterministic::errors::Error::DataError => Error::DataError,
            ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
            _ => Error::RecipeError,
        })?;
    
    match recipe {
        Some(r) => Ok(Some(CKBoostTransactionRecipe::new(r))),
        None => Ok(None),
    }
}

/// Parse CKBoost transaction recipe from a specific witness index
pub fn parse_transaction_recipe_at(index: usize) -> Result<Option<CKBoostTransactionRecipe>, Error> {
    let recipe = recipe::parse_transaction_recipe_at(index)
        .map_err(|e| match e {
            ckb_deterministic::errors::Error::DataError => Error::DataError,
            ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
            _ => Error::RecipeError,
        })?;
    
    match recipe {
        Some(r) => Ok(Some(CKBoostTransactionRecipe::new(r))),
        None => Ok(None),
    }
}

// Re-export the unified helper functions from ckb_deterministic for backward compatibility
pub use ckb_deterministic::transaction_recipe::{get_method_path, get_arguments, matches_method_path};

/// Create a CKBoost TransactionRecipe using the unified approach
pub fn create_ckboost_transaction_recipe(method_path: impl AsRef<str>, arguments: &[Vec<u8>]) -> Result<TransactionRecipe, Error> {
    create_transaction_recipe(method_path.as_ref(), arguments)
        .map_err(|e| match e {
            ckb_deterministic::errors::Error::DataError => Error::DataError,
            ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
            _ => Error::RecipeError,
        })
}

#[cfg(test)]
mod tests {
    use alloc::vec;

    use super::*;
    use crate::ssri::method_paths;

    #[test]
    fn test_create_ckboost_transaction_recipe() {
        let args = vec![b"arg1".to_vec(), b"arg2".to_vec()];
        let recipe = create_ckboost_transaction_recipe(method_paths::UPDATE_PROTOCOL, &args).unwrap();
        
        assert!(matches_method_path(&recipe, method_paths::UPDATE_PROTOCOL.as_bytes()));
        
        let result_args = get_arguments(&recipe);
        assert_eq!(result_args.len(), 2);
        assert_eq!(result_args[0], b"arg1");
        assert_eq!(result_args[1], b"arg2");
    }

    #[test]
    fn test_ckboost_transaction_recipe_wrapper() {
        let args = vec![b"test_arg".to_vec()];
        let recipe = create_ckboost_transaction_recipe(method_paths::UPDATE_TIPPING_PROPOSAL, &args).unwrap();
        let wrapper = CKBoostTransactionRecipe::new(recipe);
        
        assert_eq!(wrapper.method_path(), method_paths::UPDATE_TIPPING_PROPOSAL.as_bytes());
        assert_eq!(wrapper.arguments().len(), 1);
        assert_eq!(wrapper.arguments()[0], b"test_arg");
        assert!(wrapper.matches_method_path(method_paths::UPDATE_TIPPING_PROPOSAL.as_bytes()));
    }

    #[test]
    fn test_get_method_path() {
        let recipe = create_ckboost_transaction_recipe(method_paths::UPDATE_TIPPING_PROPOSAL, &[]).unwrap();
        let method_path = get_method_path(&recipe);
        assert_eq!(method_path, method_paths::UPDATE_TIPPING_PROPOSAL.as_bytes());
    }

    #[test]
    fn test_empty_arguments() {
        let recipe = create_ckboost_transaction_recipe(method_paths::UPDATE_PROTOCOL, &[]).unwrap();
        let args = get_arguments(&recipe);
        assert_eq!(args.len(), 0);
    }

    #[test]
    fn test_parse_transaction_recipe_functions() {
        // These tests would need a proper CKB test environment to run
        // They verify the parsing function signatures compile correctly
        let _parser_result: Result<Option<CKBoostTransactionRecipe>, Error> = parse_transaction_recipe();
        let _parser_at_result: Result<Option<CKBoostTransactionRecipe>, Error> = parse_transaction_recipe_at(0);
    }
}