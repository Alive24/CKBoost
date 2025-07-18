extern crate alloc;

use alloc::{vec, vec::Vec};
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier,
    validation::TransactionValidationRules,
};

pub mod common {
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::{assertions::expect, cell_classifier::RuleBasedClassifier};
    use ckboost_shared::transaction_context::TransactionContext;

    // **Script immutability**: Lock hash and type hash for user cells must remain unchanged
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the user cells from input and output
        let input_user_cells = match context.input_cells.get_known("user") {
            Some(cells) => cells,
            None => {
                // Only creation scenario when the recipe is create user has no input user cell
                if context.recipe.method_path_bytes().as_slice()
                    == b"CKBoostUser.createUser"
                {
                    return Ok(());
                } else {
                    return Err(DeterministicError::CellCountViolation);
                }
            }
        };
        let output_user_cells = context
            .output_cells
            .get_known("user")
            .ok_or(DeterministicError::CellCountViolation)?;

        // For each user cell, verify lock and type hashes remain unchanged
        for (i, input_cell) in input_user_cells.iter().enumerate() {
            if let Some(output_cell) = output_user_cells.get(i) {
                // Verify lock hash immutability
                expect(&input_cell.lock_hash)
                    .to_equal(&output_cell.lock_hash)
                    .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;

                // Verify type hash immutability
                match (&input_cell.type_hash, &output_cell.type_hash) {
                    (Some(input_hash), Some(output_hash)) => {
                        expect(&input_hash)
                            .to_equal(&output_hash)
                            .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;
                    }
                    _ => {
                        // Either input or output user cell has no type hash - this is not allowed
                        return Err(DeterministicError::CellRelationshipRuleViolation);
                    }
                }
            }
        }

        Ok(())
    }
}

pub mod create_user {
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"createUser".to_vec())
            .with_arguments(1)
            // Protocol cells not allowed in user creation
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(0),
                CellCountConstraint::exactly(0),
            )
            // Campaign cells not allowed in user creation
            .with_custom_cell(
                "campaign",
                CellCountConstraint::exactly(0),
                CellCountConstraint::exactly(0),
            )
            // User cells: 0 in, exactly 1 out (creation)
            .with_custom_cell(
                "user",
                CellCountConstraint::exactly(0), // No user inputs
                CellCountConstraint::exactly(1), // Exactly 1 user output
            )
            .with_business_rule(
                "user_creation_validation".to_string(),
                "Validate user creation data and initial state".to_string(),
                vec!["user".to_string()],
                business_logic::user_creation_validation,
            )
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **User creation validation**: Ensure user data is valid
        pub fn user_creation_validation(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement user creation validation
            // 1. Validate user data structure
            // 2. Ensure initial verification status is correct
            // 3. Check lock script is valid
            Ok(())
        }
    }
}

pub mod update_user_verification {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"updateUserVerification".to_vec())
            .with_arguments(1)
            // Protocol cells: at most 1 in (for checking endorser whitelist), 0 out
            .with_custom_cell(
                "protocol",
                CellCountConstraint::at_most(1),
                CellCountConstraint::exactly(0),
            )
            // Campaign cells not allowed in user verification updates
            .with_custom_cell(
                "campaign",
                CellCountConstraint::exactly(0),
                CellCountConstraint::exactly(0),
            )
            // User cells: exactly 1 in, 1 out (update)
            .with_custom_cell(
                "user",
                CellCountConstraint::exactly(1),
                CellCountConstraint::exactly(1),
            )
            .with_cell_relationship(
                "script_immutability".to_string(),
                "Script immutability must be maintained during user updates".to_string(),
                vec!["user".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "verification_update_validation".to_string(),
                "Validate user verification update permissions and data".to_string(),
                vec!["user".to_string(), "protocol".to_string()],
                business_logic::verification_update_validation,
            )
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **Verification update validation**: Ensure only authorized verification updates
        pub fn verification_update_validation(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement verification update validation
            // 1. Check if updater is in endorser whitelist (from protocol cell)
            // 2. Validate new verification data
            // 3. Ensure verification level transitions are valid
            Ok(())
        }
    }
}

pub mod update_user_stats {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"updateUserStats".to_vec())
            .with_arguments(1)
            // Protocol cells not allowed
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(0),
                CellCountConstraint::exactly(0),
            )
            // Campaign cells: at least 1 in/out (for quest completion validation)
            .with_custom_cell(
                "campaign",
                CellCountConstraint::at_least(1),
                CellCountConstraint::at_least(1),
            )
            // User cells: exactly 1 in, 1 out (update)
            .with_custom_cell(
                "user",
                CellCountConstraint::exactly(1),
                CellCountConstraint::exactly(1),
            )
            .with_cell_relationship(
                "script_immutability".to_string(),
                "Script immutability must be maintained during user stats updates".to_string(),
                vec!["user".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "stats_update_validation".to_string(),
                "Validate user stats update based on campaign interactions".to_string(),
                vec!["user".to_string(), "campaign".to_string()],
                business_logic::stats_update_validation,
            )
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **Stats update validation**: Ensure stats are updated correctly
        pub fn stats_update_validation(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement stats update validation
            // 1. Verify quest completion from campaign cell
            // 2. Calculate correct points/stats update
            // 3. Ensure stats only increase (no cheating)
            Ok(())
        }
    }
}

/// Get all validation rules for user type
pub fn get_all_rules() -> Vec<TransactionValidationRules<RuleBasedClassifier>> {
    vec![
        create_user::get_rules(),
        update_user_verification::get_rules(),
        update_user_stats::get_rules(),
    ]
}