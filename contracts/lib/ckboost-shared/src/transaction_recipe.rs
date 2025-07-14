use crate::error::Error;
use crate::generated::ckboost::{TransactionRecipe, Bytes, BytesVec};
use ckb_std::{high_level, ckb_constants::Source};
use alloc::vec::Vec;
use molecule::prelude::*;

/// Parse transaction recipe from the last witness item
/// Returns None if no witnesses exist or parsing fails
pub fn parse_transaction_recipe() -> Result<Option<TransactionRecipe>, Error> {
    // Try to find the last witness by attempting to load witnesses
    let mut last_witness_data = None;
    let mut index = 0;
    
    loop {
        match high_level::load_witness(index, Source::Input) {
            Ok(data) => {
                last_witness_data = Some(data);
                index += 1;
            }
            Err(_) => break,
        }
    }
    
    let witness_data = match last_witness_data {
        Some(data) => data,
        None => return Ok(None),
    };
    
    // Try to parse as TransactionRecipe
    match TransactionRecipe::from_slice(&witness_data) {
        Ok(recipe) => Ok(Some(recipe)),
        Err(_) => Ok(None),
    }
}

/// Parse transaction recipe from a specific witness index
pub fn parse_transaction_recipe_at(index: usize) -> Result<Option<TransactionRecipe>, Error> {
    let witness_data = high_level::load_witness(index, Source::Input)?;
    
    match TransactionRecipe::from_slice(&witness_data) {
        Ok(recipe) => Ok(Some(recipe)),
        Err(_) => Ok(None),
    }
}

/// Helper to extract method path as string
pub fn get_method_path(recipe: &TransactionRecipe) -> Result<Vec<u8>, Error> {
    let method_path_bytes = recipe.method_path();
    Ok(method_path_bytes.raw_data().to_vec())
}

/// Helper to extract arguments
pub fn get_arguments(recipe: &TransactionRecipe) -> Vec<Vec<u8>> {
    let args = recipe.arguments();
    let mut result = Vec::new();
    
    for i in 0..args.len() {
        let arg_bytes = args.get(i).unwrap();
        result.push(arg_bytes.raw_data().to_vec());
    }
    
    result
}

/// Check if the method path matches expected value
pub fn matches_method_path(recipe: &TransactionRecipe, expected_path: &[u8]) -> bool {
    let method_path = recipe.method_path();
    method_path.raw_data().as_ref() == expected_path
}

/// Builder for creating transaction recipes
pub struct TransactionRecipeBuilder {
    method_path: Vec<u8>,
    arguments: Vec<Vec<u8>>,
}

impl TransactionRecipeBuilder {
    pub fn new(method_path: impl Into<Vec<u8>>) -> Self {
        Self {
            method_path: method_path.into(),
            arguments: Vec::new(),
        }
    }
    
    pub fn add_argument(mut self, arg: impl Into<Vec<u8>>) -> Self {
        self.arguments.push(arg.into());
        self
    }
    
    pub fn build(self) -> TransactionRecipe {
        let method_path_bytes = Bytes::new_builder()
            .set(self.method_path.into_iter().map(Into::into).collect())
            .build();
            
        let mut args_builder = BytesVec::new_builder();
        for arg in self.arguments {
            let arg_bytes = Bytes::new_builder()
                .set(arg.into_iter().map(Into::into).collect())
                .build();
            args_builder = args_builder.push(arg_bytes);
        }
        let arguments = args_builder.build();
        
        TransactionRecipe::new_builder()
            .method_path(method_path_bytes)
            .arguments(arguments)
            .build()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ssri::method_paths;

    #[test]
    fn test_transaction_recipe_builder() {
        let recipe = TransactionRecipeBuilder::new(method_paths::UPDATE_PROTOCOL)
            .add_argument(b"arg1".to_vec())
            .add_argument(b"arg2".to_vec())
            .build();

        assert!(matches_method_path(&recipe, method_paths::UPDATE_PROTOCOL));
        
        let args = get_arguments(&recipe);
        assert_eq!(args.len(), 2);
        assert_eq!(args[0], b"arg1");
        assert_eq!(args[1], b"arg2");
    }

    #[test]
    fn test_get_method_path() {
        let recipe = TransactionRecipeBuilder::new(method_paths::UPDATE_TIPPING_PROPOSAL)
            .build();

        let method_path = get_method_path(&recipe).unwrap();
        assert_eq!(method_path, method_paths::UPDATE_TIPPING_PROPOSAL);
    }

    #[test]
    fn test_empty_arguments() {
        let recipe = TransactionRecipeBuilder::new(method_paths::UPDATE_PROTOCOL)
            .build();

        let args = get_arguments(&recipe);
        assert_eq!(args.len(), 0);
    }
}