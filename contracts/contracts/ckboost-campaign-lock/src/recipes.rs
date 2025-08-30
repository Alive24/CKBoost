extern crate alloc;

pub mod helper {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_std::ckb_constants::Source;
    use ckb_std::high_level::{load_cell_data, load_cell_type_hash};
    use ckboost_shared::types::CampaignData;
    use molecule::prelude::Entity;
    
    /// Find campaign cell in inputs and validate it exists
    pub fn find_campaign_cell_in_inputs(
        campaign_type_id: &[u8],
    ) -> Result<(), DeterministicError> {
        let mut index = 0;
        loop {
            match load_cell_type_hash(index, Source::Input) {
                Ok(Some(_type_hash)) => {
                    // TODO: Parse ConnectedTypeID from cell and check if type_id matches
                    // For now, we assume any type script is a campaign cell
                    debug_trace!("Found campaign cell in inputs at index {}", index);
                    return Ok(());
                }
                Err(ckb_std::error::SysError::IndexOutOfBound) => break,
                _ => {}
            }
            index += 1;
        }
        debug_trace!("Campaign cell not found in inputs");
        Err(DeterministicError::CellRelationshipRuleViolation)
    }
    
    /// Validate user is in the approved list for a quest
    pub fn validate_user_in_approved_list(
        campaign_data: &CampaignData,
        quest_id: u32,
        user_type_id: &[u8],
    ) -> Result<(), DeterministicError> {
        // Find the quest by ID
        let quests = campaign_data.quests();
        for i in 0..quests.len() {
            let quest = quests.get(i).unwrap();
            if quest.quest_id().as_slice() == &quest_id.to_le_bytes() {
                // Check if user is in approved list
                let approved_users = quest.accepted_submission_user_type_ids();
                for j in 0..approved_users.len() {
                    let approved_user = approved_users.get(j).unwrap();
                    if approved_user.as_slice() == user_type_id {
                        debug_trace!("User is approved for quest {}", quest_id);
                        return Ok(());
                    }
                }
            }
        }
        debug_trace!("User not found in approved list for quest {}", quest_id);
        Err(DeterministicError::CellRelationshipRuleViolation)
    }
}

pub mod approve_completion {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::cell_classifier::RuleBasedClassifier;
    use ckboost_shared::transaction_context::TransactionContext;
    
    /// Validate that the campaign admin is unlocking funds
    /// This is valid when the campaign cell itself is being spent
    pub fn validate_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        debug_trace!("Validating admin unlock");
        
        // Check that a campaign cell exists in inputs
        // This means the campaign admin (who owns the campaign cell) is signing the transaction
        let input_campaign_cells = context.input_cells.get_custom("campaign");
        
        if input_campaign_cells.is_some() {
            debug_trace!("Campaign cell found in inputs - admin unlock is valid");
            Ok(())
        } else {
            debug_trace!("No campaign cell in inputs - admin unlock is invalid");
            Err(DeterministicError::CellRelationshipRuleViolation)
        }
    }
}

pub mod user_claim {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::cell_classifier::RuleBasedClassifier;
    use ckboost_shared::transaction_context::TransactionContext;
    use ckb_std::ckb_constants::Source;
    use ckb_std::high_level::load_witness_args;
    
    /// Validate that an approved user is claiming rewards
    /// This checks for approval proof in the transaction witnesses
    pub fn validate_user_claim(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        debug_trace!("Validating user claim");
        
        // Check for approval proof in witnesses
        let mut index = 0;
        let mut found_proof = false;
        
        loop {
            match load_witness_args(index, Source::Input) {
                Ok(witness_args) => {
                    // Check if output_type contains approval proof
                    match witness_args.output_type().to_opt() {
                        Some(output_type) => {
                            let proof_data = output_type.raw_data();
                            if proof_data.starts_with(b"CKBoostCampaign.approve_completion") {
                                debug_trace!("Found approval proof in witness at index {}", index);
                                found_proof = true;
                                break;
                            }
                        }
                        None => {}
                    }
                }
                Err(ckb_std::error::SysError::IndexOutOfBound) => break,
                Err(_) => {}
            }
            index += 1;
        }
        
        if found_proof {
            // TODO: Further validate the proof contains valid quest_id and user_type_id
            // For now, presence of proof is sufficient
            debug_trace!("User claim is valid with approval proof");
            Ok(())
        } else {
            debug_trace!("No approval proof found - user claim is invalid");
            Err(DeterministicError::CellRelationshipRuleViolation)
        }
    }
}

pub mod common {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::cell_classifier::RuleBasedClassifier;
    use ckboost_shared::transaction_context::TransactionContext;
    
    /// Common validation that applies to all lock operations
    /// Currently just ensures basic transaction structure is valid
    pub fn validate_common(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        debug_trace!("Performing common lock validation");
        
        // Get the recipe method path to understand what operation is being performed
        let method_path = context.recipe.method_path_bytes();
        debug_trace!("Lock operation method: {:?}", core::str::from_utf8(&method_path).unwrap_or("<invalid UTF-8>"));
        
        // All lock operations are valid as long as they pass specific validation
        Ok(())
    }
}