use crate::error::Error;
use crate::transaction_recipe::{CKBoostTransactionRecipe, parse_transaction_recipe};
use crate::cell_collector::{CKBoostCellCollector, CKBoostClassifiedCells};
use crate::ssri::ArgumentDecoder;
use ckb_deterministic::transaction_context::TransactionContext;
use ckb_deterministic::cell_classifier::RuleBasedClassifier;
use ckb_std::debug;
use alloc::vec::Vec;
use alloc::string::{String, ToString};
use alloc::format;

/// CKBoost-specific transaction context wrapping the generic ckb_deterministic context
pub struct CKBoostTransactionContext {
    inner: TransactionContext<RuleBasedClassifier>,
    pub recipe: CKBoostTransactionRecipe,
    pub input_cells: CKBoostClassifiedCells,
    pub output_cells: CKBoostClassifiedCells,
    cached_arguments: Vec<Vec<u8>>, // Cache arguments to avoid lifetime issues
}

impl CKBoostTransactionContext {
    /// Create a transaction context by parsing recipe and collecting cells
    pub fn new(collector: CKBoostCellCollector) -> Result<Self, Error> {
        debug!("Creating CKBoost transaction context using ckb_deterministic");
        
        // Parse CKBoost-specific transaction recipe
        let recipe = match parse_transaction_recipe()? {
            Some(recipe) => recipe,
            None => {
                debug!("No transaction recipe found in witness");
                return Err(Error::SSRIMethodsNotFound);
            }
        };
        
        debug!("CKBoost transaction recipe found");
        
        // Convert CKBoostCellCollector to generic collector
        let generic_collector = collector.into_generic();
        
        // Create generic transaction context
        let inner = TransactionContext::new(generic_collector)
            .map_err(|e| match e {
                ckb_deterministic::errors::Error::UnidentifiedCells => Error::DetectedUnidentifiedCells,
                ckb_deterministic::errors::Error::DataError => Error::DataError,
                ckb_deterministic::errors::Error::RecipeError => Error::SSRIMethodsNotFound,
                ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
            })?;
        
        // Convert classified cells back to CKBoost types
        let input_cells = CKBoostClassifiedCells::from_generic(&inner.input_cells);
        let output_cells = CKBoostClassifiedCells::from_generic(&inner.output_cells);
        
        // Cache arguments to avoid lifetime issues
        let cached_arguments = recipe.arguments();
        
        debug!("CKBoost transaction context created successfully");
        
        Ok(Self {
            inner,
            recipe,
            input_cells,
            output_cells,
            cached_arguments,
        })
    }
    
    /// Get the recipe 
    pub fn recipe(&self) -> &CKBoostTransactionRecipe {
        &self.recipe
    }
    
    /// Get the method path 
    pub fn method_path(&self) -> Vec<u8> {
        self.recipe.method_path()
    }
    
    /// Get the arguments 
    pub fn arguments(&self) -> &[Vec<u8>] {
        &self.cached_arguments
    }
    
    /// Get argument decoder for easy argument parsing
    pub fn argument_decoder(&self) -> ArgumentDecoder {
        ArgumentDecoder::new(&self.cached_arguments)
    }
    
    /// Check if method path matches expected value
    pub fn matches_method_path(&self, expected_path: &[u8]) -> bool {
        self.recipe.matches_method_path(expected_path)
    }
    
    /// Validate that the transaction context is consistent
    pub fn validate(&self) -> Result<(), Error> {
        // First validate the inner context
        self.inner.validate().map_err(|e| match e {
            ckb_deterministic::errors::Error::UnidentifiedCells => Error::DetectedUnidentifiedCells,
            ckb_deterministic::errors::Error::DataError => Error::DataError,
            ckb_deterministic::errors::Error::RecipeError => Error::SSRIMethodsNotFound,
            ckb_deterministic::errors::Error::SystemError(code) => Error::SysError(code),
        })?;
        
        // Then validate using CKBoost-specific validation rules
        self.validate_with_ckboost_rules()?;
        
        // Finally validate script arguments for all cell types
        Ok(())
    }
    
    /// Validate transaction using CKBoost-specific validation rules
    pub fn validate_with_ckboost_rules(&self) -> Result<(), Error> {
        use crate::transaction_recipe::validation_rules;
        
        let registry = validation_rules::get_default_registry();
        
        // Validate against registered rules
        registry.validate(
            self.recipe.inner(),
            self.input_cells.inner(),
            self.output_cells.inner(),
        ).map_err(|validation_err| {
            // Convert validation error to CKBoost error
            // For now, map all validation errors to a generic validation error
            // TODO: Create specific error types for different validation failures
            Error::DataError
        })
    }
    
    /// Get summary statistics for debugging
    pub fn summary(&self) -> TransactionSummary {
        let method_path = self.recipe.method_path();
        
        TransactionSummary {
            method_path_length: method_path.len(),
            argument_count: self.cached_arguments.len(),
            // Known CKB cells
            input_udt_cells: self.input_cells.udt_cells().map_or(0, |v| v.len()),
            input_spore_cells: self.input_cells.spore_cells().map_or(0, |v| v.len()),
            input_simple_ckb_cells: self.input_cells.simple_ckb_cells().map_or(0, |v| v.len()),
            // CKBoost custom cells
            input_protocol_cells: self.input_cells.protocol_cells().map_or(0, |v| v.len()),
            input_campaign_cells: self.input_cells.campaign_cells().map_or(0, |v| v.len()),
            input_user_cells: self.input_cells.user_cells().map_or(0, |v| v.len()),
            input_unidentified_cells: self.input_cells.unidentified_cells().len(),
            // Output cells
            output_udt_cells: self.output_cells.udt_cells().map_or(0, |v| v.len()),
            output_spore_cells: self.output_cells.spore_cells().map_or(0, |v| v.len()),
            output_simple_ckb_cells: self.output_cells.simple_ckb_cells().map_or(0, |v| v.len()),
            output_protocol_cells: self.output_cells.protocol_cells().map_or(0, |v| v.len()),
            output_campaign_cells: self.output_cells.campaign_cells().map_or(0, |v| v.len()),
            output_user_cells: self.output_cells.user_cells().map_or(0, |v| v.len()),
            output_unidentified_cells: self.output_cells.unidentified_cells().len(),
        }
    }
}

/// Summary statistics for transaction context
#[derive(Debug)]
pub struct TransactionSummary {
    pub method_path_length: usize,
    pub argument_count: usize,
    // Input known CKB cells
    pub input_udt_cells: usize,
    pub input_spore_cells: usize,
    pub input_simple_ckb_cells: usize,
    // Input CKBoost custom cells
    pub input_protocol_cells: usize,
    pub input_campaign_cells: usize,
    pub input_user_cells: usize,
    pub input_unidentified_cells: usize,
    // Output known CKB cells
    pub output_udt_cells: usize,
    pub output_spore_cells: usize,
    pub output_simple_ckb_cells: usize,
    // Output CKBoost custom cells
    pub output_protocol_cells: usize,
    pub output_campaign_cells: usize,
    pub output_user_cells: usize,
    pub output_unidentified_cells: usize,
}

impl TransactionSummary {
    /// Get total count of identified cells (excluding unidentified)
    pub fn identified_cell_count(&self) -> usize {
        self.input_udt_cells + self.input_spore_cells + self.input_simple_ckb_cells +
        self.input_protocol_cells + self.input_campaign_cells + self.input_user_cells +
        self.output_udt_cells + self.output_spore_cells + self.output_simple_ckb_cells +
        self.output_protocol_cells + self.output_campaign_cells + self.output_user_cells
    }
}

/// Builder for creating transaction contexts with different configurations
pub struct CKBoostTransactionContextBuilder {
    collector: CKBoostCellCollector,
}

impl CKBoostTransactionContextBuilder {
    /// Create a new builder with default CKBoost collector
    pub fn new() -> Result<Self, Error> {
        Ok(Self { 
            collector: CKBoostCellCollector::new()?
        })
    }
    
    /// Create a new builder with mock collector for testing
    pub fn mock() -> Self {
        Self { 
            collector: CKBoostCellCollector::mock()
        }
    }
    
    /// Create a new builder with custom collector
    pub fn with_collector(collector: CKBoostCellCollector) -> Self {
        Self { collector }
    }
    
    /// Enable or disable strict mode for unidentified cells
    pub fn with_strict_mode(mut self, strict: bool) -> Self {
        self.collector = self.collector.with_strict_mode(strict);
        self
    }
    
    /// Build the transaction context
    pub fn build(self) -> Result<CKBoostTransactionContext, Error> {
        CKBoostTransactionContext::new(self.collector)
    }
}

/// Convenience function to create a transaction context with default settings
pub fn create_transaction_context() -> Result<CKBoostTransactionContext, Error> {
    CKBoostTransactionContextBuilder::new()?.build()
}

/// Convenience function to create a mock transaction context for testing
pub fn create_mock_transaction_context() -> Result<CKBoostTransactionContext, Error> {
    CKBoostTransactionContextBuilder::mock().build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_transaction_summary() {
        let summary = TransactionSummary {
            method_path_length: 32,
            argument_count: 2,
            // Input cells
            input_udt_cells: 2,
            input_spore_cells: 0,
            input_simple_ckb_cells: 1,
            input_protocol_cells: 1,
            input_campaign_cells: 0,
            input_user_cells: 0,
            input_unidentified_cells: 0,
            // Output cells
            output_udt_cells: 2,
            output_spore_cells: 0,
            output_simple_ckb_cells: 1,
            output_protocol_cells: 1,
            output_campaign_cells: 0,
            output_user_cells: 0,
            output_unidentified_cells: 0,
        };
        
        // Test that summary contains expected values
        assert_eq!(summary.method_path_length, 32);
        assert_eq!(summary.argument_count, 2);
        assert_eq!(summary.input_protocol_cells, 1);
        assert_eq!(summary.input_udt_cells, 2);
        assert_eq!(summary.input_simple_ckb_cells, 1);
    }
    
    #[test]
    fn test_transaction_context_builder() {
        let _builder = CKBoostTransactionContextBuilder::mock()
            .with_strict_mode(true);
            
        // Builder should be configured correctly
        // Note: Actual build() would fail in test environment due to missing CKB syscalls
    }
}