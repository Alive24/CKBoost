// CKBoost-specific transaction recipe implementation using ckb_deterministic
use crate::error::Error;
use crate::ssri::method_paths;
use ckb_deterministic::generated::TransactionRecipe;
use ckb_deterministic::transaction_recipe::{
    self as recipe, 
    TransactionRecipeExt,
    create_transaction_recipe
};
use alloc::vec;
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
            ckb_deterministic::errors::Error::ValidationError(_) => Error::DataError,
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
            ckb_deterministic::errors::Error::ValidationError(_) => Error::DataError,
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
            ckb_deterministic::errors::Error::ValidationError(_) => Error::DataError,
            _ => Error::RecipeError,
        })
}

// ============================================================================
// Recipe Builders for CKBoost Transactions
// ============================================================================

/// Recipe builder for Protocol operations
pub mod protocol_recipes {
    use super::*;
    
    /// Create recipe for updating protocol configuration
    /// Arguments:
    /// - new_protocol_data: Serialized ProtocolData (complete protocol configuration)
    pub fn update_protocol(new_protocol_data: Vec<u8>) -> Result<TransactionRecipe, Error> {
        let args = vec![new_protocol_data];
        create_ckboost_transaction_recipe(method_paths::UPDATE_PROTOCOL, &args)
    }
}

// ============================================================================
// Decentralized Validation Approach
// ============================================================================
// 
// CKBoost uses a decentralized validation approach where each type script
// validates its own transactions. This reduces contract size and improves
// modularity:
//
// - Protocol Type Contract: Validates protocol updates and tipping proposals
// - Campaign Type Contract: Validates campaign creation and updates
// - User Type Contract: Validates user verification and updates
//
// The shared library only provides common utilities like recipe parsing
// and transaction context creation.

// Validation functions that were previously here have been moved to their respective type contracts
// to reduce contract sizes and improve modularity.

// Legacy validation rules module - removed as part of decentralized validation approach
// Each type script now handles its own validation:
// - Protocol Type Contract: Validates protocol updates and tipping proposals
// - Campaign Type Contract: Validates campaign creation and updates
// - User Type Contract: Validates user verification and updates

/*
/// Legacy validation rules module - kept for reference only
pub mod validation_rules {
    use super::*;
    use ckb_deterministic::validation::{
        TransactionValidationRules, 
        CellCountConstraint,
        ValidationRegistry,
    };
    
    // NOTE: Protocol-specific validation rules have been moved to the protocol type contract
    // The protocol type contract now handles all validation for:
    // - create_protocol_update_rules()
    // - create_tipping_proposal_update_rules()
    // These functions are kept here commented out for reference only
    
    /*
    /// Create validation rules for protocol update transactions
    /// Rules:
    /// - Exactly 1 protocol cell in inputs and outputs
    /// - At least 1 simple CKB cell for fees
    /// - No campaign or user cells allowed
    /// - Exactly 1 argument (new protocol data)
    pub fn create_protocol_update_rules() -> TransactionValidationRules {
        TransactionValidationRules::new(method_paths::UPDATE_PROTOCOL.as_bytes())
            .with_arguments(1)
            // Protocol cells: exactly 1 in, 1 out (singleton pattern)
            .with_custom_cell(b"protocol", CellCountConstraint::exactly(1), CellCountConstraint::exactly(1))
            // Simple CKB: at least 1 for fees in inputs, any number in outputs
            .with_known_cell(b"simple_ckb", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Campaign cells: not allowed
            .with_custom_cell(b"campaign", CellCountConstraint::exactly(0), CellCountConstraint::exactly(0))
            // User cells: not allowed
            .with_custom_cell(b"user", CellCountConstraint::exactly(0), CellCountConstraint::exactly(0))
            // UDT and Spore cells: allowed but not required
            .with_known_cell(b"udt", CellCountConstraint::any(), CellCountConstraint::any())
            .with_known_cell(b"spore", CellCountConstraint::any(), CellCountConstraint::any())
    }
    
    /// Create validation rules for tipping proposal update transactions
    /// Rules:
    /// - Exactly 1 protocol cell in inputs and outputs (contains tipping proposals)
    /// - At least 1 simple CKB cell for fees
    /// - No campaign or user cells allowed
    /// - Exactly 2 arguments (protocol_type_hash, proposal_data)
    pub fn create_tipping_proposal_update_rules() -> TransactionValidationRules {
        TransactionValidationRules::new(method_paths::UPDATE_TIPPING_PROPOSAL.as_bytes())
            .with_arguments(2)
            // Protocol cells: exactly 1 in, 1 out (contains proposals)
            .with_custom_cell(b"protocol", CellCountConstraint::exactly(1), CellCountConstraint::exactly(1))
            // Simple CKB: at least 1 for fees in inputs, any number in outputs
            .with_known_cell(b"simple_ckb", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Campaign cells: not allowed
            .with_custom_cell(b"campaign", CellCountConstraint::exactly(0), CellCountConstraint::exactly(0))
            // User cells: not allowed
            .with_custom_cell(b"user", CellCountConstraint::exactly(0), CellCountConstraint::exactly(0))
            // UDT and Spore cells: allowed but not required
            .with_known_cell(b"udt", CellCountConstraint::any(), CellCountConstraint::any())
            .with_known_cell(b"spore", CellCountConstraint::any(), CellCountConstraint::any())
    }
    */
    
    /// Create validation rules for campaign creation transactions
    /// Rules:
    /// - Exactly 0 campaign cells in inputs, 1 in outputs (creation)
    /// - At least 1 UDT cell for funding
    /// - At least 1 simple CKB cell for fees
    /// - Exactly 3 arguments (campaign_data, funding_amount, duration)
    pub fn create_campaign_creation_rules() -> TransactionValidationRules {
        TransactionValidationRules::new(method_paths::CREATE_CAMPAIGN.as_bytes())
            .with_arguments(3)
            // Campaign cells: 0 in inputs (creation), exactly 1 in outputs
            .with_custom_cell(b"campaign", CellCountConstraint::exactly(0), CellCountConstraint::exactly(1))
            // UDT cells: at least 1 for funding in inputs, any in outputs
            .with_known_cell(b"udt", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Simple CKB: at least 1 for fees in inputs, any number in outputs
            .with_known_cell(b"simple_ckb", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Protocol cells: not required for campaign creation
            .with_custom_cell(b"protocol", CellCountConstraint::any(), CellCountConstraint::any())
            // User cells: not directly involved in campaign creation
            .with_custom_cell(b"user", CellCountConstraint::any(), CellCountConstraint::any())
            // Spore cells: allowed but not required
            .with_known_cell(b"spore", CellCountConstraint::any(), CellCountConstraint::any())
            // Add custom validator for business logic
            .with_custom_validator(validate_campaign_creation_transaction)
    }
    
    /// Create validation rules for user verification update transactions
    /// Rules:
    /// - At least 1 user cell in inputs and outputs (update verification status)
    /// - At least 1 simple CKB cell for fees
    /// - Exactly 2 arguments (user_data, verification_proof)
    pub fn create_user_verification_update_rules() -> TransactionValidationRules {
        TransactionValidationRules::new(method_paths::UPDATE_USER_VERIFICATION.as_bytes())
            .with_arguments(2)
            // User cells: at least 1 in inputs and outputs (update verification)
            .with_custom_cell(b"user", CellCountConstraint::at_least(1), CellCountConstraint::at_least(1))
            // Simple CKB: at least 1 for fees in inputs, any number in outputs
            .with_known_cell(b"simple_ckb", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Protocol cells: not required for user verification
            .with_custom_cell(b"protocol", CellCountConstraint::any(), CellCountConstraint::any())
            // Campaign cells: not directly involved in user verification
            .with_custom_cell(b"campaign", CellCountConstraint::any(), CellCountConstraint::any())
            // UDT and Spore cells: allowed but not required
            .with_known_cell(b"udt", CellCountConstraint::any(), CellCountConstraint::any())
            .with_known_cell(b"spore", CellCountConstraint::any(), CellCountConstraint::any())
            // Add custom validator for business logic
            .with_custom_validator(validate_user_verification_update_transaction)
    }
    
    /// Create validation rules for quest completion transactions
    /// Rules:
    /// - At least 1 user cell in inputs and outputs (update user data)
    /// - At least 1 campaign cell in inputs and outputs (update campaign progress)
    /// - UDT cells for rewards (0 in inputs, at least 1 in outputs)
    /// - Exactly 3 arguments (quest_id, completion_proof, reward_amount)
    pub fn create_quest_completion_rules() -> TransactionValidationRules {
        TransactionValidationRules::new(method_paths::COMPLETE_QUEST.as_bytes())
            .with_arguments(3)
            // User cells: at least 1 in inputs and outputs (update progress)
            .with_custom_cell(b"user", CellCountConstraint::at_least(1), CellCountConstraint::at_least(1))
            // Campaign cells: at least 1 in inputs and outputs (update progress)
            .with_custom_cell(b"campaign", CellCountConstraint::at_least(1), CellCountConstraint::at_least(1))
            // UDT cells: rewards (0 in inputs from user, at least 1 in outputs to user)
            .with_known_cell(b"udt", CellCountConstraint::any(), CellCountConstraint::at_least(1))
            // Simple CKB: at least 1 for fees
            .with_known_cell(b"simple_ckb", CellCountConstraint::at_least(1), CellCountConstraint::any())
            // Protocol cells: not directly involved
            .with_custom_cell(b"protocol", CellCountConstraint::any(), CellCountConstraint::any())
            // Spore cells: allowed but not required
            .with_known_cell(b"spore", CellCountConstraint::any(), CellCountConstraint::any())
            // Add custom validator for business logic
            .with_custom_validator(validate_quest_completion_transaction)
    }
    
    /// Create a complete validation registry for CKBoost transactions
    /// NOTE: Protocol-specific validation rules have been moved to the protocol type contract
    pub fn create_ckboost_validation_registry() -> ValidationRegistry {
        let mut registry = ValidationRegistry::new();
        
        // Register non-protocol transaction type rules
        // Protocol update and tipping proposal rules are handled by the protocol type contract
        registry.register(create_campaign_creation_rules());
        registry.register(create_user_verification_update_rules());
        registry.register(create_quest_completion_rules());
        
        registry
    }
    
    /// Convenience function to get the default CKBoost validation registry
    pub fn get_default_registry() -> ValidationRegistry {
        create_ckboost_validation_registry()
    }
    
    // ========================================================================
    // Custom Validation Functions
    // ========================================================================
    
    // NOTE: Protocol-specific validation has been moved to the protocol type contract
    // since protocol cells are always present in protocol-related transactions.
    // The protocol type contract (ckboost-protocol-type) now handles all protocol
    // update and tipping proposal validation logic.
    
    /// Custom validator for campaign creation transactions
    fn validate_campaign_creation_transaction(
        recipe: &ckb_deterministic::generated::TransactionRecipe,
        input_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
        output_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
    ) -> Result<(), ValidationError> {
        use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
        
        let args = recipe.arguments_vec();
        if args.len() != 3 {
            return Err(ValidationError::InvalidArgumentCount {
                expected: 3,
                actual: args.len(),
            });
        }
        
        // Validate campaign data argument
        if args[0].len() < 64 {
            return Err(ValidationError::CustomValidation(
                "Campaign data must be at least 64 bytes".to_string()
            ));
        }
        
        // Validate funding amount argument (16-byte u128)
        if args[1].len() != 16 {
            return Err(ValidationError::CustomValidation(
                "Funding amount must be exactly 16 bytes (u128)".to_string()
            ));
        }
        
        // Validate duration argument (8-byte u64)
        if args[2].len() != 8 {
            return Err(ValidationError::CustomValidation(
                "Campaign duration must be exactly 8 bytes (u64)".to_string()
            ));
        }
        
        // Parse and validate funding amount
        let funding_amount = u128::from_le_bytes(
            args[1][..16].try_into()
                .map_err(|_| ValidationError::CustomValidation("Invalid funding amount format".to_string()))?
        );
        
        if funding_amount == 0 {
            return Err(ValidationError::CustomValidation(
                "Campaign funding amount must be greater than zero".to_string()
            ));
        }
        
        // Parse and validate duration
        let duration = u64::from_le_bytes(
            args[2][..8].try_into()
                .map_err(|_| ValidationError::CustomValidation("Invalid duration format".to_string()))?
        );
        
        if duration == 0 {
            return Err(ValidationError::CustomValidation(
                "Campaign duration must be greater than zero".to_string()
            ));
        }
        
        // Validate campaign cell creation (0 inputs, 1 output)
        let input_campaigns = input_cells.get_custom(b"campaign");
        let output_campaigns = output_cells.get_custom(b"campaign")
            .ok_or_else(|| ValidationError::CustomValidation("Campaign output cell required for creation".to_string()))?;
            
        if input_campaigns.is_some() && !input_campaigns.unwrap().is_empty() {
            return Err(ValidationError::CustomValidation(
                "Campaign creation should have no campaign input cells".to_string()
            ));
        }
        
        if output_campaigns.len() != 1 {
            return Err(ValidationError::CustomValidation(
                "Campaign creation should produce exactly one campaign cell".to_string()
            ));
        }
        
        Ok(())
    }
    
    /// Custom validator for user verification update transactions
    fn validate_user_verification_update_transaction(
        recipe: &ckb_deterministic::generated::TransactionRecipe,
        input_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
        output_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
    ) -> Result<(), ValidationError> {
        use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
        
        let args = recipe.arguments_vec();
        if args.len() != 2 {
            return Err(ValidationError::InvalidArgumentCount {
                expected: 2,
                actual: args.len(),
            });
        }
        
        // Validate user data argument
        if args[0].len() < 32 {
            return Err(ValidationError::CustomValidation(
                "User data must be at least 32 bytes".to_string()
            ));
        }
        
        // Validate verification proof argument
        if args[1].len() < 64 {
            return Err(ValidationError::CustomValidation(
                "Verification proof must be at least 64 bytes".to_string()
            ));
        }
        
        // Validate user cell update (at least 1 in inputs and outputs)
        let input_users = input_cells.get_custom(b"user")
            .ok_or_else(|| ValidationError::CustomValidation("User input cell required for verification update".to_string()))?;
        let output_users = output_cells.get_custom(b"user")
            .ok_or_else(|| ValidationError::CustomValidation("User output cell required for verification update".to_string()))?;
            
        if input_users.is_empty() || output_users.is_empty() {
            return Err(ValidationError::CustomValidation(
                "User verification update requires user cells in both inputs and outputs".to_string()
            ));
        }
        
        // TODO: Add verification-specific validation
        // - Validate verification status transitions
        // - Validate proof authenticity
        // - Validate user data consistency
        
        Ok(())
    }
    
    /// Custom validator for quest completion transactions
    fn validate_quest_completion_transaction(
        recipe: &ckb_deterministic::generated::TransactionRecipe,
        input_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
        output_cells: &ckb_deterministic::cell_classifier::ClassifiedCells,
    ) -> Result<(), ValidationError> {
        use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
        
        let args = recipe.arguments_vec();
        if args.len() != 3 {
            return Err(ValidationError::InvalidArgumentCount {
                expected: 3,
                actual: args.len(),
            });
        }
        
        // Validate quest ID argument (32-byte identifier)
        if args[0].len() != 32 {
            return Err(ValidationError::CustomValidation(
                "Quest ID must be exactly 32 bytes".to_string()
            ));
        }
        
        // Validate completion proof argument
        if args[1].len() < 64 {
            return Err(ValidationError::CustomValidation(
                "Completion proof must be at least 64 bytes".to_string()
            ));
        }
        
        // Validate reward amount argument (16-byte u128)
        if args[2].len() != 16 {
            return Err(ValidationError::CustomValidation(
                "Reward amount must be exactly 16 bytes (u128)".to_string()
            ));
        }
        
        // Parse and validate reward amount
        let reward_amount = u128::from_le_bytes(
            args[2][..16].try_into()
                .map_err(|_| ValidationError::CustomValidation("Invalid reward amount format".to_string()))?
        );
        
        if reward_amount == 0 {
            return Err(ValidationError::CustomValidation(
                "Quest reward amount must be greater than zero".to_string()
            ));
        }
        
        // Validate user cell update (at least 1 in inputs and outputs)
        let input_users = input_cells.get_custom(b"user")
            .ok_or_else(|| ValidationError::CustomValidation("User input cell required for quest completion".to_string()))?;
        let output_users = output_cells.get_custom(b"user")
            .ok_or_else(|| ValidationError::CustomValidation("User output cell required for quest completion".to_string()))?;
            
        if input_users.is_empty() || output_users.is_empty() {
            return Err(ValidationError::CustomValidation(
                "Quest completion requires user cells in both inputs and outputs".to_string()
            ));
        }
        
        // Validate campaign cell update (at least 1 in inputs and outputs)
        let input_campaigns = input_cells.get_custom(b"campaign")
            .ok_or_else(|| ValidationError::CustomValidation("Campaign input cell required for quest completion".to_string()))?;
        let output_campaigns = output_cells.get_custom(b"campaign")
            .ok_or_else(|| ValidationError::CustomValidation("Campaign output cell required for quest completion".to_string()))?;
            
        if input_campaigns.is_empty() || output_campaigns.is_empty() {
            return Err(ValidationError::CustomValidation(
                "Quest completion requires campaign cells in both inputs and outputs".to_string()
            ));
        }
        
        Ok(())
    }
}
*/

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
    
    #[test]
    fn test_protocol_recipes() {
        // Test update_protocol recipe creation
        let protocol_data = b"new_protocol_configuration_data".to_vec();
        let recipe = protocol_recipes::update_protocol(protocol_data.clone()).unwrap();
        
        // Verify method path
        assert!(matches_method_path(&recipe, method_paths::UPDATE_PROTOCOL.as_bytes()));
        
        // Verify arguments
        let args = get_arguments(&recipe);
        assert_eq!(args.len(), 1);
        assert_eq!(args[0], protocol_data);
    }
    
    // Validation rules tests removed - validation is now decentralized to each type script
}