extern crate alloc;

pub mod helper {
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_std::ckb_constants::Source;
    use ckb_std::high_level::{load_cell_data, load_cell_type_hash};
    use ckboost_shared::types::protocol::ProtocolDataReader;
    use molecule::prelude::Reader;

    // 1.Validate a protocol cell's data against expected campaign code hash
    // 2. Validate connection to campaign type
    pub fn validate_protocol_cell(
        data: &[u8],
        expected_code_hash: &[u8],
    ) -> Result<(), DeterministicError> {
        let protocol_data =
            ProtocolDataReader::from_slice(data).map_err(|_| DeterministicError::Encoding)?;

        let campaign_code_hash = protocol_data
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_campaign_type_code_hash();

        if campaign_code_hash.as_slice() == expected_code_hash {
            Ok(())
        } else {
            Err(DeterministicError::CellRelationshipRuleViolation)
        }
    }

    // Find and validate protocol cell in deps
    pub fn find_protocol_cell_in_deps(
        protocol_type_hash: &[u8],
        current_code_hash: &[u8],
    ) -> Result<(), DeterministicError> {
        let mut index = 0;
        loop {
            match load_cell_type_hash(index, Source::CellDep) {
                Ok(Some(dep_type_hash)) if dep_type_hash == protocol_type_hash => {
                    // Found a matching type hash, validate the cell data
                    let data = load_cell_data(index, Source::CellDep)
                        .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;

                    // Try to validate the protocol cell, return Ok if successful
                    match validate_protocol_cell(&data, current_code_hash) {
                        Ok(()) => return Ok(()),
                        Err(_) => {} // Continue searching if validation fails
                    }
                }
                Err(ckb_std::error::SysError::IndexOutOfBound) => break,
                _ => {}
            }
            index += 1;
        }
        Err(DeterministicError::CellRelationshipRuleViolation)
    }
}

pub mod common {
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::{assertions::expect, cell_classifier::RuleBasedClassifier};
    use ckboost_shared::transaction_context::TransactionContext;

    // **Script immutability**: Lock hash and type hash for campaign cells must remain unchanged
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the campaign cells from input and output
        let input_campaign_cells = match context.input_cells.get_known("campaign") {
            Some(cells) => cells,
            None => {
                // Only creation scenario when the recipe is create campaign has no input campaign cell
                if context.recipe.method_path_bytes().as_slice()
                    == b"CKBoostCampaign.createCampaign"
                {
                    return Ok(());
                } else {
                    return Err(DeterministicError::CellCountViolation);
                }
            }
        };
        let output_campaign_cells = context
            .output_cells
            .get_known("campaign")
            .ok_or(DeterministicError::CellCountViolation)?;

        // For each campaign cell, verify lock and type hashes remain unchanged
        for (i, input_cell) in input_campaign_cells.iter().enumerate() {
            let output_cell = output_campaign_cells
                .get(i)
                .ok_or(DeterministicError::CellCountViolation)?;

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
                    // Either input or output campaign cell has no type hash - this is not allowed
                    return Err(DeterministicError::CellRelationshipRuleViolation);
                }
            }
        }

        Ok(())
    }
}

pub mod update_campaign {
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"updateCampaign".to_vec())
            .with_arguments(1)
            // Protocol cells: No protocol cells
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(0), // No input protocol cell
                CellCountConstraint::exactly(0), // No output protocol cell
            )
            // Campaign cells: at most 1 in, exactly 1 out.
            .with_custom_cell(
                "campaign",
                CellCountConstraint::at_most(1), // No campaign inputs
                CellCountConstraint::exactly(1), // Exactly 1 campaign output
            )
            // User cells not allowed
            .with_custom_cell(
                "user",
                CellCountConstraint::exactly(0), // No user inputs
                CellCountConstraint::exactly(0), // No user outputs
            )
            .with_cell_relationship(
                "reference_to_protocol".to_string(),
                "Campaign type args must reference protocol cell's type hash in CellDeps"
                    .to_string(),
                vec!["campaign".to_string()],
                cell_relationship::reference_to_protocol,
            )
            .with_business_rule(
                "campaign_update_validation".to_string(),
                "Validate campaign update data and permissions".to_string(),
                vec!["campaign".to_string(), "protocol".to_string()],
                business_logic::campaign_update_validation,
            )
    }
    pub mod cell_relationship {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;
        use molecule::prelude::Entity;

        // Campaign type args must reference protocol cell's type hash in the CellDep
        pub fn reference_to_protocol(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get campaign cell from output
            let output_campaign_cell = context
                .output_cells
                .get_known("campaign")
                .ok_or(DeterministicError::CellCountViolation)?
                .first()
                .ok_or(DeterministicError::CellCountViolation)?;

            // Get the campaign cell's type script
            let type_script = output_campaign_cell
                .type_script
                .as_ref()
                .ok_or(DeterministicError::CellRelationshipRuleViolation)?;

            // Extract protocol type hash from type args (first 32 bytes)
            let type_args = type_script.args().raw_data();
            if type_args.len() < 32 {
                return Err(DeterministicError::CellRelationshipRuleViolation);
            }
            let protocol_type_hash = &type_args[0..32];

            // Find and validate protocol cell
            crate::recipes::helper::find_protocol_cell_in_deps(
                protocol_type_hash,
                type_script.code_hash().as_slice(),
            )
        }
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **Campaign update validation**: Ensure campaign data is valid and creator has permission
        pub fn campaign_update_validation(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement campaign update validation
            // 1. Check if updater is campaign owner
            // 2. Validate updated data
            // 3. Ensure campaign state transitions are valid
            Ok(())
        }
    }
}

pub mod complete_quest {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"completeQuest".to_vec())
            .with_arguments(2) // quest_id and user proof
            // Protocol cells not allowed
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(0),
                CellCountConstraint::exactly(0),
            )
            // Campaign cells: exactly 1 in, 1 out (to update quest completion status)
            .with_custom_cell(
                "campaign",
                CellCountConstraint::exactly(1),
                CellCountConstraint::exactly(1),
            )
            // User cells: at least 1 in, at least 1 out (to record completion)
            .with_custom_cell(
                "user",
                CellCountConstraint::at_least(1),
                CellCountConstraint::at_least(1),
            )
            .with_cell_relationship(
                "script_immutability".to_string(),
                "Script immutability must be maintained during quest completion".to_string(),
                vec!["campaign".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "quest_completion_validation".to_string(),
                "Validate quest completion proof and update campaign state".to_string(),
                vec!["campaign".to_string(), "user".to_string()],
                business_logic::quest_completion_validation,
            )
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **Quest completion validation**: Ensure valid quest completion
        pub fn quest_completion_validation(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement quest completion validation
            // 1. Verify quest exists in campaign
            // 2. Check user hasn't already completed quest
            // 3. Validate completion proof
            // 4. Update campaign quest completion count
            Ok(())
        }
    }
}
