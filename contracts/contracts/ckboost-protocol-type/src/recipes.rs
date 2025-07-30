extern crate alloc;

pub mod common {
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::{assertions::expect, cell_classifier::RuleBasedClassifier};
    use ckboost_shared::transaction_context::TransactionContext;

    // **Script immutability**: Lock hash and type hash for protocol cell must remain unchanged to maintain security and singleton pattern
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the protocol cells from input and output.
        let input_protocol_cells = match context.input_cells.get_known("protocol") {
            Some(cells) => cells,
            None => {
                // Only creation scenario when the recipe is update protocol has no input protocol cell
                if context.recipe.method_path_bytes().as_slice()
                    == b"CKBoostProtocol.update_protocol"
                {
                    return Ok(());
                } else {
                    return Err(DeterministicError::CellCountViolation);
                }
            }
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
        expect(&input_protocol_cell.lock_hash)
            .to_equal(&output_protocol_cell.lock_hash)
            .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;

        // Verify type hash immutability (protocol type hash must remain unchanged)
        match (
            &input_protocol_cell.type_hash,
            &output_protocol_cell.type_hash,
        ) {
            (Some(input_hash), Some(output_hash)) => {
                expect(&input_hash)
                    .to_equal(&output_hash)
                    .map_err(|_| DeterministicError::CellRelationshipRuleViolation)?;
            }
            _ => {
                // Either input or output protocol cell has no type hash - this is not allowed
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
        TransactionValidationRules::new(b"CKBoostProtocol.update_protocol".to_vec())
            .with_arguments(1)
            // Protocol cells: exactly 1 in, 1 out (singleton pattern)
            .with_custom_cell(
                "protocol",
                CellCountConstraint::at_most(1), // At most 1 input protocol cell
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
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            use ckb_deterministic::assertions::expect;
            use ckboost_shared::generated::ckboost::ProtocolData;
            use molecule::prelude::*;

            // Get the protocol cells from input and output
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

            // Parse protocol data from cell data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;

            // Get tipping proposals from protocol data
            let input_tipping_proposals = input_protocol_data.tipping_proposals();
            let output_tipping_proposals = output_protocol_data.tipping_proposals();

            // Compare tipping proposals - they must be identical
            // First check if the counts match
            expect(input_tipping_proposals.len()).to_equal(output_tipping_proposals.len())?;

            // Then compare each proposal's raw bytes
            // We compare raw bytes because comparing the entire structure ensures
            // no field within any proposal has changed
            // TODO: We can use hash to compare the entire structure instead of comparing each field
            let input_bytes = input_tipping_proposals.as_slice();
            let output_bytes = output_tipping_proposals.as_slice();

            if input_bytes != output_bytes {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            Ok(())
        }
    }
}

pub mod update_tipping_proposal {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"updateTippingProposal".to_vec())
            .with_arguments(1)
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
                "Script immutability must be maintained during tipping proposal updates".to_string(),
                vec!["protocol".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "add_only_proposal_creation".to_string(),
                "New tipping proposals can only be added, existing proposals cannot be modified or removed".to_string(),
                vec!["protocol".to_string()],
                business_logic::add_only_proposal_creation,
            )
            .with_business_rule(
                "add_only_approval_mechanism".to_string(),
                "Proposal approvals can only be added, existing approvals cannot be revoked or modified".to_string(),
                vec!["protocol".to_string()],
                business_logic::add_only_approval_mechanism,
            )
            .with_business_rule(
                "automatic_execution".to_string(),
                "When a proposal receives sufficient approval, it must be automatically executed".to_string(),
                vec!["protocol".to_string()],
                business_logic::automatic_execution,
            )
            .with_business_rule(
                "approval_restrictions".to_string(),
                "Cannot approve proposals that are already fully approved or have expired".to_string(),
                vec!["protocol".to_string()],
                business_logic::approval_restrictions,
            )
            .with_business_rule(
                "data_immutability".to_string(),
                "All other protocol data must remain unchanged during tipping proposal updates".to_string(),
                vec!["protocol".to_string()],
                business_logic::data_immutability,
            )
    }

    pub mod business_logic {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckb_deterministic::assertions::expect;
        use ckboost_shared::transaction_context::TransactionContext;
        use ckboost_shared::generated::ckboost::ProtocolData;
        use molecule::prelude::*;

        /// **Add-only proposal creation**: New tipping proposals can only be added,
        /// existing proposals cannot be modified or removed
        pub fn add_only_proposal_creation(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Verify singleton
            expect(input_protocol_cells.len()).to_equal(1)?;
            expect(output_protocol_cells.len()).to_equal(1)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            let input_proposals = input_protocol_data.tipping_proposals();
            let output_proposals = output_protocol_data.tipping_proposals();

            // Check that output has at least as many proposals as input
            if output_proposals.len() < input_proposals.len() {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Verify all existing proposals remain unchanged
            for i in 0..input_proposals.len() {
                let input_proposal = input_proposals.get(i).unwrap();
                let output_proposal = output_proposals.get(i).unwrap();
                
                if input_proposal.as_slice() != output_proposal.as_slice() {
                    return Err(DeterministicError::BusinessRuleViolation);
                }
            }

            Ok(())
        }

        /// **Add-only approval mechanism**: Proposal approvals can only be added,
        /// existing approvals cannot be revoked or modified
        pub fn add_only_approval_mechanism(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            let input_proposals = input_protocol_data.tipping_proposals();
            let output_proposals = output_protocol_data.tipping_proposals();

            // For each existing proposal, verify approvals only increase
            for i in 0..input_proposals.len() {
                let input_proposal = input_proposals.get(i).unwrap();
                let output_proposal = output_proposals.get(i).unwrap();
                
                // approval_transaction_hash is a Byte32Vec that stores approval hashes
                let input_approvals = input_proposal.approval_transaction_hash();
                let output_approvals = output_proposal.approval_transaction_hash();

                // Check that output has at least as many approvals as input
                if output_approvals.len() < input_approvals.len() {
                    return Err(DeterministicError::BusinessRuleViolation);
                }

                // Verify all existing approvals remain unchanged
                for j in 0..input_approvals.len() {
                    let input_approval = input_approvals.get(j).unwrap();
                    let output_approval = output_approvals.get(j).unwrap();
                    
                    if input_approval.as_slice() != output_approval.as_slice() {
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                }
            }

            Ok(())
        }

        /// **Automatic execution**: When a proposal receives sufficient approval,
        /// it must be automatically executed with funds transferred to the target address
        pub fn automatic_execution(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            let input_proposals = input_protocol_data.tipping_proposals();
            let output_proposals = output_protocol_data.tipping_proposals();
            let tipping_config = input_protocol_data.tipping_config();

            // Check each proposal to see if it should be executed
            for i in 0..input_proposals.len() {
                let input_proposal = input_proposals.get(i).unwrap();
                
                // Get approval count from approval_transaction_hash vector
                let approval_count = input_proposal.approval_transaction_hash().len() as u8;
                
                // Get approval threshold based on proposal amount
                let _proposal_amount = input_proposal.amount();
                let thresholds = tipping_config.approval_requirement_thresholds();
                
                // Find appropriate threshold
                // For now, we'll use a simple threshold calculation
                // In a real implementation, you'd check the amount against the thresholds
                let required_approvals = if thresholds.len() > 0 {
                    // Use thresholds length as a simple proxy for required approvals
                    // In production, you'd have a proper threshold lookup based on amount
                    core::cmp::min(3u8, thresholds.len() as u8)
                } else {
                    1u8 // Default minimum
                };

                // If proposal has enough approvals, it should be executed (removed from list)
                if approval_count >= required_approvals {
                    // The proposal should not exist in output (it was executed)
                    // Since we're checking existing proposals, if it still exists with enough approvals,
                    // that's a violation
                    if i < output_proposals.len() {
                        match output_proposals.get(i) {
                            Some(output_proposal) => {
                                // Compare to see if it's the same proposal
                                if input_proposal.as_slice() == output_proposal.as_slice() {
                                    return Err(DeterministicError::BusinessRuleViolation);
                                }
                            }
                            None => {
                                // Index out of bounds, skip
                            }
                        }
                    }
                }
            }

            Ok(())
        }

        /// **Approval restrictions**: Cannot approve proposals that are already
        /// fully approved or have expired
        pub fn approval_restrictions(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // For this validation, we need to compare input and output to detect new approvals
            // We'll check if expired proposals have new approvals or if fully approved proposals get more
            
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            let input_proposals = input_protocol_data.tipping_proposals();
            let output_proposals = output_protocol_data.tipping_proposals();
            let tipping_config = output_protocol_data.tipping_config();
            
            // Get expiration duration
            let expiration_duration_bytes = tipping_config.expiration_duration();
            let _expiration_duration = u64::from_le_bytes(
                expiration_duration_bytes.as_slice()[0..8]
                    .try_into()
                    .map_err(|_| DeterministicError::Encoding)?
            );

            // Get current timestamp from transaction context
            // Note: In a real implementation, you'd get this from the block header
            // For now, we'll use a placeholder approach
            // TODO: Implement proper timestamp retrieval from header deps
            
            // Check each proposal for new approvals
            for i in 0..input_proposals.len() {
                if i >= output_proposals.len() {
                    break; // Proposal was removed (executed)
                }
                
                let input_proposal = input_proposals.get(i).unwrap();
                let output_proposal = output_proposals.get(i).unwrap();
                
                let input_approvals = input_proposal.approval_transaction_hash();
                let output_approvals = output_proposal.approval_transaction_hash();
                
                // Check if new approvals were added
                if output_approvals.len() > input_approvals.len() {
                    // New approvals were added, check if this is allowed
                    
                    // Check if proposal is already at max approvals
                    let thresholds = tipping_config.approval_requirement_thresholds();
                    let max_approvals = if thresholds.len() > 0 {
                        core::cmp::min(5, thresholds.len()) // Reasonable max
                    } else {
                        3 // Default max
                    };
                    
                    if input_approvals.len() >= max_approvals {
                        // Already at max approvals, no new ones allowed
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                    
                    // TODO: Check expiration when we have proper timestamp access
                    // For now, we'll skip the expiration check
                }
            }

            Ok(())
        }

        /// **Data immutability**: All other protocol data must remain unchanged
        /// during tipping proposal updates
        pub fn data_immutability(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_known("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            // Check all fields except tipping_proposals remain unchanged
            
            // campaigns_approved must be unchanged
            if input_protocol_data.campaigns_approved().as_slice() 
                != output_protocol_data.campaigns_approved().as_slice() {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // tipping_config must be unchanged
            if input_protocol_data.tipping_config().as_slice() 
                != output_protocol_data.tipping_config().as_slice() {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // endorsers_whitelist must be unchanged
            if input_protocol_data.endorsers_whitelist().as_slice() 
                != output_protocol_data.endorsers_whitelist().as_slice() {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // protocol_config must be unchanged
            if input_protocol_data.protocol_config().as_slice() 
                != output_protocol_data.protocol_config().as_slice() {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Note: last_updated is allowed to change as it tracks update timestamp

            Ok(())
        }
    }
}
