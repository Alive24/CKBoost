extern crate alloc;

pub mod common {
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::{assertions::expect, cell_classifier::RuleBasedClassifier};
    use ckboost_shared::transaction_context::TransactionContext;

    // **Script immutability**: Admin lock hash and protocol type hash must remain unchanged to maintain security and singleton pattern
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the protocol cells from input and output.
        let input_protocol_cells = match context.input_cells.get_known("protocol") {
            Some(cells) => cells,
            None => return Ok(()), // Creation scenario - no input protocol cell to validate
        };
        let output_protocol_cells = context
            .output_cells
            .get_known("protocol")
            .ok_or(DeterministicError::CellCountViolation)?;

        // Should have exactly one protocol cell in input and output (singleton pattern)
        expect(input_protocol_cells.len()).to_equal(1)?;
        expect(output_protocol_cells.len()).to_equal(1)?;

        let input_protocol_cell = &input_protocol_cells[0];
        let output_protocol_cell = &output_protocol_cells[0];

        // Verify lock hash immutability (admin lock hash must remain unchanged)
        expect(&input_protocol_cell.lock.code_hash())
            .to_equal(&output_protocol_cell.lock.code_hash())
            .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;

        // Verify type hash immutability (protocol type hash must remain unchanged)
        match (
            &input_protocol_cell.type_script,
            &output_protocol_cell.type_script,
        ) {
            (Some(input_type), Some(output_type)) => {
                expect(&input_type.code_hash())
                    .to_equal(&output_type.code_hash())
                    .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;
            }
            _ => {
                // One has type script, the other doesn't - this is not allowed
                return Err(DeterministicError::CellRelationshipRuleViolation);
            }
        }

        Ok(())
    }
}

pub mod update_protocol {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"updateProtocol".to_vec())
            .with_arguments(1)
            // Protocol cells: exactly 1 in, 1 out (singleton pattern)
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(1), // Exactly 1 input protocol cell
                CellCountConstraint::exactly(1), // Exactly 1 output protocol cell
            )
            // Campaign and user cells not allowed in protocol updates
            .with_custom_cell(
                "campaign",
                CellCountConstraint::exactly(0), // No campaign inputs
                CellCountConstraint::exactly(0), // No campaign outputs
            )
            .with_custom_cell(
                "user",
                CellCountConstraint::exactly(0), // No user inputs
                CellCountConstraint::exactly(0), // No user outputs
            )
            .with_cell_relationship(
                "script_immutability".to_string(),
                "Script immutability must be maintained during protocol updates".to_string(),
                vec!["protocol".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "tipping_proposal_immutability".to_string(),
                "Tipping proposal data must remain unchanged during protocol updates to maintain proposal integrity".to_string(),
                vec!["protocol".to_string()],
                business_logic::tipping_proposal_immutability,
            )
    }

    pub mod cell_relationship {}

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::transaction_context::TransactionContext;

        // **Tipping proposal immutability**: Tipping proposal data must remain unchanged during protocol updates to maintain proposal integrity
        pub fn tipping_proposal_immutability(
            _context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // TODO: Implement tipping proposal immutability validation
            Ok(())
        }
    }
}
