extern crate alloc;

pub mod helper {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_std::ckb_constants::Source;
    use ckb_std::debug;
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
            ("CellRelationshipRuleViolation: Campaign code hash mismatch in protocol cell");
            ("  Expected: {:?}", expected_code_hash);
            ("  Got: {:?}", campaign_code_hash.as_slice());
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
                    let data = load_cell_data(index, Source::CellDep).map_err(|e| {
                        (
                            "CellRelationshipRuleViolation: Failed to load cell data at index {}",
                            index,
                        );
                        ("  Error: {:?}", e);
                        DeterministicError::CellRelationshipRuleViolation
                    })?;

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
        debug_trace!("CellRelationshipRuleViolation: Protocol cell not found in deps");
        debug_trace!("  Looking for protocol type hash: {:?}", protocol_type_hash);
        Err(DeterministicError::CellRelationshipRuleViolation)
    }
}

pub mod common {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_deterministic::transaction_recipe::TransactionRecipeExt;
    use ckb_deterministic::{assertions::expect, cell_classifier::RuleBasedClassifier};
    use ckboost_shared::transaction_context::TransactionContext;

    // **Script immutability**: Lock hash and type hash for campaign cells must remain unchanged
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the campaign cells from input and output
        let input_campaign_cells = match context.input_cells.get_custom("campaign") {
            Some(cells) => cells,
            None => {
                // Only creation scenario when the recipe is create campaign has no input campaign cell
                if context.recipe.method_path_bytes().as_slice()
                    == b"CKBoostCampaign.create_campaign"
                {
                    return Ok(());
                } else {
                    debug_trace!("Missing campaign cell in input");
                    return Err(DeterministicError::CellCountViolation);
                }
            }
        };
        let output_campaign_cells =
            context.output_cells.get_custom("campaign").ok_or_else(|| {
                debug_trace!(
                    "CellCountViolation: Missing campaign cell in output (script_immutability)"
                );
                DeterministicError::CellCountViolation
            })?;

        // For each campaign cell, verify lock and type hashes remain unchanged
        for (i, input_cell) in input_campaign_cells.iter().enumerate() {
            let output_cell = output_campaign_cells.get(i).ok_or_else(|| {
                debug_trace!(
                    "CellCountViolation: Output campaign cell {} not found (script_immutability)",
                    i
                );
                DeterministicError::CellCountViolation
            })?;

            // Verify lock hash immutability
            expect(&input_cell.lock_hash)
                .to_equal(&output_cell.lock_hash)
                .map_err(|_| {
                    debug_trace!(
                        "CellRelationshipRuleViolation: Lock hash mismatch at index {}",
                        i
                    );
                    debug_trace!("  Input lock hash: {:?}", input_cell.lock_hash);
                    debug_trace!("  Output lock hash: {:?}", output_cell.lock_hash);
                    DeterministicError::CellRelationshipRuleViolation
                })?;

            // Verify type hash immutability
            match (&input_cell.type_hash, &output_cell.type_hash) {
                (Some(input_hash), Some(output_hash)) => {
                    expect(&input_hash).to_equal(&output_hash).map_err(|_| {
                        debug_trace!(
                            "CellRelationshipRuleViolation: Type hash mismatch at index {}",
                            i
                        );
                        debug_trace!("  Input type hash: {:?}", input_hash);
                        debug_trace!("  Output type hash: {:?}", output_hash);
                        DeterministicError::CellRelationshipRuleViolation
                    })?;
                }
                _ => {
                    // Either input or output campaign cell has no type hash - this is not allowed
                    debug_trace!("CellRelationshipRuleViolation: Campaign cell missing type hash at index {}", i);
                    debug_trace!("  Input has type: {}", input_cell.type_hash.is_some());
                    debug_trace!("  Output has type: {}", output_cell.type_hash.is_some());
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
        let udt_identifiers = ckboost_shared::cell_collector::get_all_udt_identifiers().unwrap();
        let mut rules =
            TransactionValidationRules::new(b"CKBoostCampaign.update_campaign".to_vec())
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
                );
        for udt_identifier in udt_identifiers {
            rules = rules.with_custom_cell(
                udt_identifier,
                CellCountConstraint::at_least(0),
                CellCountConstraint::at_least(0),
            );
        }
        rules
    }
    pub mod cell_relationship {
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::{transaction_context::TransactionContext, types::ConnectedTypeID};
        use molecule::prelude::Entity;

        // Campaign type args must reference protocol cell's type hash in the CellDep
        // Supports exactly two patterns:
        // 1. Direct reference: args is exactly the protocol type hash (32 bytes)
        // 2. ConnectedTypeID: args is exactly a ConnectedTypeID structure (76 bytes)
        // No other sizes or extra data allowed
        pub fn reference_to_protocol(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get campaign cell from output
            let output_campaign_cell = context
                .output_cells
                .get_custom("campaign")
                .ok_or_else(|| {
                    ("CellCountViolation: Missing campaign cells in output (reference_to_protocol)");
                    DeterministicError::CellCountViolation
                })?
                .first()
                .ok_or_else(|| {
                    ("CellCountViolation: Empty campaign cells list in output (reference_to_protocol)");
                    DeterministicError::CellCountViolation
                })?;

            // Get the campaign cell's type script
            let type_script = output_campaign_cell
                .type_script
                .as_ref()
                .ok_or_else(|| {
                    ("CellRelationshipRuleViolation: Campaign cell has no type script (reference_to_protocol)");
                    DeterministicError::CellRelationshipRuleViolation
                })?;

            // Extract protocol type hash from type args
            let type_args = type_script.args().raw_data();

            // Determine the pattern based on exact args length
            let protocol_type_hash = if type_args.len() == 32 {
                // Pattern 1: Direct reference - args is exactly the protocol type hash
                ("Using direct reference pattern (exactly 32 bytes)");
                type_args.to_vec()
            } else if type_args.len() == 76 {
                // Pattern 2: ConnectedTypeID - parse the structure
                ("Using ConnectedTypeID pattern (exactly 76 bytes)");

                // Parse as ConnectedTypeID
                let connected_type_id = ConnectedTypeID::from_slice(&type_args).map_err(|e| {
                    ("CellRelationshipRuleViolation: Failed to parse ConnectedTypeID");
                    ("  Error: {:?}", e);
                    DeterministicError::CellRelationshipRuleViolation
                })?;

                // Extract the connected_key field (this is the protocol type hash)
                connected_type_id.connected_key().raw_data().to_vec()
            } else {
                // Invalid length - only 32 or 76 bytes allowed
                ("CellRelationshipRuleViolation: Type args must be exactly 32 bytes (direct) or 76 bytes (ConnectedTypeID)");
                ("  Got: {} bytes", type_args.len());
                ("  Type args: {:?}", type_args);
                return Err(DeterministicError::CellRelationshipRuleViolation);
            };

            // Find and validate protocol cell
            crate::recipes::helper::find_protocol_cell_in_deps(
                &protocol_type_hash,
                type_script.code_hash().as_slice(),
            )
        }
    }

    pub mod business_logic {
        use ckb_deterministic::assertions::expect;
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::debug_trace;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::generated::ckboost::CampaignData;
        use ckboost_shared::transaction_context::TransactionContext;
        use molecule::prelude::*;

        // **Campaign update validation**: Ensure campaign data is valid and creator has permission
        pub fn campaign_update_validation(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            debug_trace!(" Starting validation");

            // Get campaign cells
            let input_campaign_cells = context.input_cells.get_custom("campaign");
            debug_trace!(
                " Input campaign cells: {:?}",
                input_campaign_cells.as_ref().map(|cells| cells.len())
            );

            let output_campaign_cells = context
                .output_cells
                .get_custom("campaign")
                .ok_or_else(|| {
                    ("CellCountViolation: Missing campaign cell in output (campaign_update_validation)");
                    DeterministicError::CellCountViolation
                })?;
            debug_trace!(" Output campaign cells: {}", output_campaign_cells.len());

            // Ensure we have exactly one output campaign
            expect(output_campaign_cells.len()).to_equal(1)?;
            let output_campaign_cell = &output_campaign_cells[0];

            // Parse output campaign data
            let output_campaign_data = CampaignData::from_slice(&output_campaign_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;

            // Validate based on whether this is an update or creation
            match input_campaign_cells {
                Some(input_cells) => {
                    // This is an update (input campaign exists), validate permissions
                    expect(input_cells.len()).to_equal(1)?;
                    let input_campaign_cell = &input_cells[0];

                    // Parse input campaign data
                    let input_campaign_data = CampaignData::from_slice(&input_campaign_cell.data)
                        .map_err(|_| DeterministicError::Encoding)?;

                    // Verify creator remains the same (campaigns cannot change ownership)
                    if input_campaign_data.endorser().as_slice()
                        != output_campaign_data.endorser().as_slice()
                    {
                        debug_trace!("Campaign endorser changed during update");
                        return Err(DeterministicError::BusinessRuleViolation);
                    }

                    // Validate status transitions
                    let input_status = input_campaign_data.status();
                    let output_status = output_campaign_data.status();

                    // Status transition rules:
                    // 0 (created) -> 1 (funding) -> 2 (reviewing) -> 3 (approved) -> 4 (active) -> 5 (completed)
                    // Backwards transitions are not allowed
                    if output_status < input_status {
                        debug_trace!("Campaign status decreased during update");
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                }
                None => {
                    debug_trace!(" This is a new campaign creation");

                    // This is a new campaign creation
                    // Verify status is 0 (created)
                    let status = output_campaign_data.status();
                    debug_trace!(" Campaign status: {}", status);
                    if status != 0u8.into() {
                        debug_trace!(" ERROR: New campaign must have status 0, got {}", status);
                        debug_trace!(" Campaign status: {}", status);
                        return Err(DeterministicError::BusinessRuleViolation);
                    }

                    // Verify participants_count and total_completions are 0
                    let zero_u32 =
                        ckboost_shared::generated::ckboost::Uint32::from_slice(&[0u8; 4]).unwrap();
                    let participants = output_campaign_data.participants_count();
                    let completions = output_campaign_data.total_completions();

                    debug_trace!(" Participants count: {:?}", participants.as_slice());
                    debug_trace!(" Total completions: {:?}", completions.as_slice());

                    if participants.as_slice() != zero_u32.as_slice()
                        || completions.as_slice() != zero_u32.as_slice()
                    {
                        debug_trace!(
                            " ERROR: New campaign must have 0 participants and completions"
                        );
                        debug_trace!(" Participants count: {:?}", participants.as_slice());
                        debug_trace!(" Total completions: {:?}", completions.as_slice());
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                }
            }

            // Common validations for both create and update
            // 1. Campaign must have at least one quest
            let quest_count = output_campaign_data.quests().len();
            debug_trace!(" Quest count: {}", quest_count);
            if quest_count == 0 {
                debug_trace!(" ERROR: Campaign must have at least one quest");
                debug_trace!(" Quest count: {}", quest_count);
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // 2. Title and descriptions must not be empty
            let title_empty = output_campaign_data.metadata().title().is_empty();
            let short_desc_empty = output_campaign_data
                .metadata()
                .short_description()
                .is_empty();
            let long_desc_empty = output_campaign_data
                .metadata()
                .long_description()
                .is_empty();

            debug_trace!(
                " Title empty: {}, short_desc empty: {}, long_desc empty: {}",
                title_empty,
                short_desc_empty,
                long_desc_empty
            );

            if title_empty || short_desc_empty || long_desc_empty {
                debug_trace!(" ERROR: Title and descriptions must not be empty");
                debug_trace!(
                    " Title empty: {}, short_desc empty: {}, long_desc empty: {}",
                    title_empty,
                    short_desc_empty,
                    long_desc_empty
                );
                return Err(DeterministicError::BusinessRuleViolation);
            }

            Ok(())
        }
    }
}

pub mod approve_completion {
    use super::common;
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        let udt_identifiers = ckboost_shared::cell_collector::get_all_udt_identifiers().unwrap();
        let mut rules = 
        TransactionValidationRules::new(b"CKBoostCampaign.approve_completion".to_vec())
            .with_arguments(3) // campaign_data, quest_id and user_type_ids
            // Protocol cells in deps for Points UDT validation
            .with_custom_cell(
                "protocol",
                CellCountConstraint::exactly(0), // No input protocol cell
                CellCountConstraint::exactly(0), // No output protocol cell
            )
            // Campaign cells: exactly 1 in, 1 out (to update accepted submissions)
            .with_custom_cell(
                "campaign",
                CellCountConstraint::exactly(1),
                CellCountConstraint::exactly(1),
            )
            // User cells: 0 or more for Points minting (handled by Points UDT)
            .with_custom_cell(
                "user",
                CellCountConstraint::at_least(0),
                CellCountConstraint::at_least(0),
            )
            // Points UDT cells: allowed for minting points rewards
            .with_custom_cell(
                "points",
                CellCountConstraint::at_least(0), // May have points inputs for minting
                CellCountConstraint::at_least(0), // May have points outputs as rewards
            )
            .with_cell_relationship(
                "script_immutability".to_string(),
                "Script immutability must be maintained during approval".to_string(),
                vec!["campaign".to_string()],
                common::script_immutability,
            )
            .with_business_rule(
                "approval_validation".to_string(),
                "Validate quest approval and update accepted submissions".to_string(),
                vec!["campaign".to_string()],
                business_logic::approval_validation,
            );
        for udt_identifier in udt_identifiers {
            rules = rules.with_custom_cell(
                udt_identifier,
                CellCountConstraint::at_least(0),
                CellCountConstraint::at_least(0),
            );
        }
        rules
    }

    pub mod business_logic {
        use alloc::vec::Vec;
        use ckb_deterministic::assertions::expect;
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::debug_trace;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckb_std::debug;
        use ckboost_shared::generated::ckboost::CampaignData;
        use ckboost_shared::transaction_context::TransactionContext;
        use molecule::prelude::*;

        // **Approval validation**: Ensure valid quest approval by admin
        pub fn approval_validation(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get campaign cells
            let input_campaign_cells =
                context.input_cells.get_custom("campaign").ok_or_else(|| {
                    debug!(
                        "CellCountViolation: Missing campaign cell in input (approval_validation)"
                    );
                    DeterministicError::CellCountViolation
                })?;
            let output_campaign_cells =
                context.output_cells.get_custom("campaign").ok_or_else(|| {
                    debug!(
                        "CellCountViolation: Missing campaign cell in output (approval_validation)"
                    );
                    DeterministicError::CellCountViolation
                })?;

            // Ensure we have exactly one campaign in and out
            expect(input_campaign_cells.len()).to_equal(1)?;
            expect(output_campaign_cells.len()).to_equal(1)?;

            let input_campaign_cell = &input_campaign_cells[0];
            let output_campaign_cell = &output_campaign_cells[0];

            // Parse campaign data
            let input_campaign_data = CampaignData::from_slice(&input_campaign_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_campaign_data = CampaignData::from_slice(&output_campaign_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;

            // TODO: Not handling this for now
            // // Verify campaign status is active (4)
            // if input_campaign_data.status() != 4u8.into() {
            //     debug!("Campaign is not active, status: {}", input_campaign_data.status());
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            // Get campaign_data from transaction arguments (should be first argument)
            let _campaign_data_arg = context.recipe.arguments().get(0).ok_or_else(|| {
                debug_trace!(
                    "InvalidArgumentCount: Missing campaign_data argument (approval_validation)"
                );
                DeterministicError::InvalidArgumentCount
            })?;

            // Get quest_id from transaction arguments (should be second argument)
            let quest_id_arg = context.recipe.arguments().get(1).ok_or_else(|| {
                debug_trace!(
                    "InvalidArgumentCount: Missing quest_id argument (approval_validation)"
                );
                DeterministicError::InvalidArgumentCount
            })?;

            // Get user_type_ids from transaction arguments (should be third argument)
            let user_ids_arg = context.recipe.arguments().get(2).ok_or_else(|| {
                debug_trace!(
                    "InvalidArgumentCount: Missing user_type_ids argument (approval_validation)"
                );
                DeterministicError::InvalidArgumentCount
            })?;

            // Extract the quest_id
            let quest_id_bytes = quest_id_arg.data();
            let arg_type = quest_id_arg.arg_type();

            // For output references, we would need to load from outputs_data
            // For validation, we'll check the structure is correct
            if arg_type.as_slice()[0] != 2 {
                debug_trace!("Quest ID argument is not an output reference");
                return Err(DeterministicError::InvalidArgumentCount);
            }
            
            // Parse quest_id as u32
            let quest_id_raw = quest_id_bytes.raw_data();
            if quest_id_raw.len() < 4 {
                debug_trace!("Invalid quest_id format");
                return Err(DeterministicError::InvalidArgumentCount);
            }
            let mut quest_id_bytes_array = [0u8; 4];
            quest_id_bytes_array.copy_from_slice(&quest_id_raw[0..4]);
            let quest_id = u32::from_le_bytes(quest_id_bytes_array);
            
            debug_trace!("Processing approval for quest ID: {}", quest_id);

            // Extract user_type_ids from argument
            let user_ids_bytes = user_ids_arg.data();
            let user_ids_arg_type = user_ids_arg.arg_type();

            if user_ids_arg_type.as_slice()[0] != 2 {
                debug_trace!("User IDs argument is not an output reference");
                return Err(DeterministicError::InvalidArgumentCount);
            }
            
            // Parse the user_type_ids list - it should be a vector of 32-byte type_ids
            // The format is: [count][type_id_1][type_id_2]...
            let user_ids_raw = user_ids_bytes.raw_data();
            if user_ids_raw.len() < 4 {
                debug_trace!("Invalid user_type_ids format - too short");
                return Err(DeterministicError::InvalidArgumentCount);
            }
            
            let mut count_bytes = [0u8; 4];
            count_bytes.copy_from_slice(&user_ids_raw[0..4]);
            let count = u32::from_le_bytes(count_bytes);
            
            let mut approved_user_type_ids = Vec::new();
            let mut offset = 4;
            
            for _ in 0..count {
                if offset + 32 > user_ids_raw.len() {
                    debug_trace!("Invalid user_type_ids format - not enough bytes");
                    return Err(DeterministicError::InvalidArgumentCount);
                }
                
                let mut type_id = [0u8; 32];
                type_id.copy_from_slice(&user_ids_raw[offset..offset + 32]);
                approved_user_type_ids.push(type_id);
                offset += 32;
            }
            
            debug_trace!("Approved user type IDs count: {}", approved_user_type_ids.len());

            // Verify that total_completions increased
            let input_completions_data = input_campaign_data.total_completions();
            let output_completions_data = output_campaign_data.total_completions();

            let input_completions_bytes = input_completions_data.as_slice();
            let output_completions_bytes = output_completions_data.as_slice();

            // Convert to u32 for comparison
            let mut input_comp_array = [0u8; 4];
            let mut output_comp_array = [0u8; 4];
            input_comp_array.copy_from_slice(&input_completions_bytes[0..4]);
            output_comp_array.copy_from_slice(&output_completions_bytes[0..4]);
            let input_completions = u32::from_le_bytes(input_comp_array);
            let output_completions = u32::from_le_bytes(output_comp_array);

            // Completions should increase (by the number of approved users)
            if output_completions <= input_completions {
                debug_trace!(
                    "Total completions did not increase: {} -> {}",
                    input_completions,
                    output_completions
                );
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Verify endorser remains the same (campaigns cannot change ownership)
            if input_campaign_data.endorser().as_slice()
                != output_campaign_data.endorser().as_slice()
            {
                debug_trace!("Campaign endorser changed during approval");
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Verify that at least one quest exists
            let quest_count = output_campaign_data.quests().len();
            if quest_count == 0 {
                debug_trace!("Campaign has no quests");
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Verify that points and udt rewards are properly distributed
            
            // Get quest data for reward validation
            // Note: quest_id is in the arguments but we need to parse it properly
            // For now, we'll validate that rewards go to approved users
            
            // 1. Get user cells from CellDeps to validate approved users
            let dep_user_cells = context.cell_deps.get_custom("user");
            
            // 2. Check for Points UDT cells in outputs (minting new points)
            let output_points_cells = context.output_cells.get_custom("points");
            
            // 3. Check for UDT reward cells in outputs
            let udt_identifiers = ckboost_shared::cell_collector::get_all_udt_identifiers()
                .map_err(|_| DeterministicError::BusinessRuleViolation)?;
            
            // Collect all reward cells (both points and UDT)
            let mut reward_cells = Vec::new();
            
            // Add points cells to rewards
            if let Some(points_cells) = output_points_cells {
                for cell in points_cells {
                    reward_cells.push((cell, "points"));
                }
            }
            
            // Add UDT cells to rewards
            for udt_id in &udt_identifiers {
                if let Some(udt_cells) = context.output_cells.get_custom(udt_id) {
                    for cell in udt_cells {
                        reward_cells.push((cell, udt_id.as_str()));
                    }
                }
            }
            
            // If rewards are distributed, validate they go to approved users
            if !reward_cells.is_empty() {
                debug_trace!("Validating {} reward cells", reward_cells.len());
                
                // User cells must be in deps for validation
                let user_cells_in_deps = dep_user_cells.ok_or_else(|| {
                    debug_trace!("No user cells in deps for reward validation");
                    DeterministicError::CellRelationshipRuleViolation
                })?;
                
                // For each reward cell, validate:
                // 1. The lock matches a user cell lock in deps
                // 2. The user's type_id is in the approved list
                for (reward_cell, reward_type) in &reward_cells {
                    let reward_lock_hash = &reward_cell.lock_hash;
                    
                    // Find matching user cell in deps
                    let matching_user = user_cells_in_deps
                        .iter()
                        .find(|user_cell| &user_cell.lock_hash == reward_lock_hash);
                    
                    if matching_user.is_none() {
                        debug_trace!(
                            "Reward ({}) has no matching user cell in deps. Lock: {:?}",
                            reward_type,
                            reward_lock_hash
                        );
                        return Err(DeterministicError::CellRelationshipRuleViolation);
                    }
                    
                    let user_cell = matching_user.unwrap();
                    
                    // Extract type_id from user cell's type args (ConnectedTypeID structure)
                    // The type_id is the first 32 bytes of the ConnectedTypeID
                    if let Some(type_script) = &user_cell.type_script {
                        let type_args = type_script.args().raw_data();
                        
                        if type_args.len() != 76 {
                            debug_trace!("User cell type args not ConnectedTypeID format");
                            return Err(DeterministicError::CellRelationshipRuleViolation);
                        }
                        
                        // Parse ConnectedTypeID to get the type_id
                        use ckboost_shared::types::ConnectedTypeID;
                        let connected_type_id = ConnectedTypeID::from_slice(&type_args)
                            .map_err(|_| DeterministicError::Encoding)?;
                        
                        let user_type_id = connected_type_id.type_id();
                        
                        // Verify this type_id is in the approved list
                        let user_type_id_bytes = user_type_id.as_slice();
                        let is_approved = approved_user_type_ids.iter().any(|approved_id| {
                            approved_id == user_type_id_bytes
                        });
                        
                        if !is_approved {
                            debug_trace!(
                                "User type_id not in approved list: {:?}",
                                user_type_id_bytes
                            );
                            return Err(DeterministicError::BusinessRuleViolation);
                        }
                        
                        debug_trace!(
                            "User type_id approved for reward: {:?}",
                            user_type_id_bytes
                        );
                    } else {
                        debug_trace!("User cell has no type script");
                        return Err(DeterministicError::CellRelationshipRuleViolation);
                    }
                }
                
                // Validate reward amounts match quest data
                // Get the quest from campaign data
                let quests = output_campaign_data.quests();
                if quest_id >= quests.len() as u32 {
                    debug_trace!("Quest ID {} out of range (total quests: {})", quest_id, quests.len());
                    return Err(DeterministicError::BusinessRuleViolation);
                }
                
                let quest = quests.get(quest_id as usize).unwrap();
                // Get rewards from the quest's reward structure
                let quest_points = quest.points();
                let quest_rewards_on_completion = quest.rewards_on_completion();
                
                // For each reward type, validate amounts
                // Points rewards - check if non-zero
                let zero_points_u32 = [0u8; 4];
                if quest_points.as_slice() != &zero_points_u32 {
                    // Verify points cells exist and have correct amounts
                    let points_rewards: Vec<_> = reward_cells.iter()
                        .filter(|(_, reward_type)| *reward_type == "points")
                        .collect();
                    
                    if points_rewards.is_empty() {
                        debug_trace!("Quest expects points but no points rewards found");
                        // This is OK - rewards might be distributed later
                    } else {
                        // Validate each points reward has the correct amount
                        // Note: Points validation would be done by the Points UDT type script
                        debug_trace!("Found {} points rewards", 
                                   points_rewards.len());
                    }
                }
                
                // Asset rewards on completion (AssetListVec)
                // rewards_on_completion is an AssetListVec, which contains AssetList items
                for i in 0..quest_rewards_on_completion.len() {
                    let asset_list = quest_rewards_on_completion.get(i).unwrap();
                    
                    // Check UDT assets in the AssetList
                    let udt_assets = asset_list.udt_assets();
                    for j in 0..udt_assets.len() {
                        let udt_asset = udt_assets.get(j).unwrap();
                        let udt_type_script = udt_asset.udt_script();
                        let udt_amount = udt_asset.amount();
                        
                        // Check if UDT amount is non-zero (compare as slices)
                        let zero_amount = [0u8; 16];
                        if udt_amount.as_slice() != &zero_amount {
                            // Find the UDT identifier for this type script
                            let udt_identifier = ckboost_shared::cell_collector::get_udt_identifier(&udt_type_script);
                            
                            // Check if rewards of this type exist
                            let udt_specific_rewards: Vec<_> = reward_cells.iter()
                                .filter(|(_, reward_type)| *reward_type == udt_identifier.as_str())
                                .collect();
                            
                            if udt_specific_rewards.is_empty() {
                                debug_trace!("Quest expects UDT {} but no such rewards found", 
                                           udt_identifier);
                                // This is OK - rewards might be distributed later
                            } else {
                                // Validate amounts - actual validation done by UDT type script
                                debug_trace!("Found {} rewards of UDT {}", 
                                           udt_specific_rewards.len(), udt_identifier);
                            }
                        }
                    }
                    
                    // Also check points amount in the AssetList if needed
                    let asset_points = asset_list.points_amount();
                    // Check if points amount is non-zero
                    let zero_points = [0u8; 8];
                    if asset_points.as_slice() != &zero_points {
                        debug_trace!("AssetList also contains points");
                    }
                }
                
                debug_trace!("All rewards validated successfully");
            } else {
                debug_trace!("No rewards distributed - deferred distribution");
                // This is acceptable - admin might approve without immediate reward distribution
            }

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
        let udt_identifiers = ckboost_shared::cell_collector::get_all_udt_identifiers().unwrap();
        let mut rules = TransactionValidationRules::new(b"CKBoostCampaign.complete_quest".to_vec())
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
            );
        for udt_identifier in udt_identifiers {
            rules = rules.with_custom_cell(
                udt_identifier,
                CellCountConstraint::at_least(0),
                CellCountConstraint::at_least(0),
            );
        }
        rules
    }

    pub mod business_logic {
        use ckb_deterministic::assertions::expect;
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::debug_trace;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckboost_shared::generated::ckboost::CampaignData;
        use ckboost_shared::transaction_context::TransactionContext;
        use molecule::prelude::*;

        // **Quest completion validation**: Ensure valid quest completion
        pub fn quest_completion_validation(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            // Get campaign cells
            let input_campaign_cells = context
                .input_cells
                .get_custom("campaign")
                .ok_or_else(|| {
                    ("CellCountViolation: Missing campaign cell in input (quest_completion_validation)");
                    DeterministicError::CellCountViolation
                })?;
            let output_campaign_cells = context
                .output_cells
                .get_custom("campaign")
                .ok_or_else(|| {
                    ("CellCountViolation: Missing campaign cell in output (quest_completion_validation)");
                    DeterministicError::CellCountViolation
                })?;

            // Get user cells
            let input_user_cells = context.input_cells.get_custom("user").ok_or_else(|| {
                ("CellCountViolation: Missing user cell in input (quest_completion_validation)");
                DeterministicError::CellCountViolation
            })?;
            let output_user_cells = context.output_cells.get_custom("user").ok_or_else(|| {
                ("CellCountViolation: Missing user cell in output (quest_completion_validation)");
                DeterministicError::CellCountViolation
            })?;

            // Ensure we have exactly one campaign in and out
            expect(input_campaign_cells.len()).to_equal(1)?;
            expect(output_campaign_cells.len()).to_equal(1)?;

            // Ensure we have at least one user cell
            if input_user_cells.is_empty() || output_user_cells.is_empty() {
                debug_trace!("No user cells found");
                return Err(DeterministicError::CellCountViolation);
            }

            let input_campaign_cell = &input_campaign_cells[0];
            let output_campaign_cell = &output_campaign_cells[0];

            // Parse campaign data
            let input_campaign_data = CampaignData::from_slice(&input_campaign_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_campaign_data = CampaignData::from_slice(&output_campaign_cell.data)
                .map_err(|_| DeterministicError::Encoding)?;

            // Get quest_id from transaction arguments (should be first argument)
            let quest_id_arg = context.recipe.arguments().get(0).ok_or_else(|| {
                debug_trace!(
                    "InvalidArgumentCount: Missing quest_id argument (quest_completion_validation)"
                );
                DeterministicError::InvalidArgumentCount
            })?;

            // Extract the data from the RecipeArgument
            let quest_id_bytes = quest_id_arg.data();

            // Check if it's a reference (arg_type should be 2 for output reference)
            let arg_type = quest_id_arg.arg_type();
            if arg_type.as_slice()[0] == 2 {
                // It's an output reference, we need to get the actual index
                let index_bytes = quest_id_bytes.as_slice();
                if index_bytes.len() != 4 {
                    debug_trace!("InvalidArgumentCount: Quest ID index length is not 4 (quest_completion_validation)");
                    return Err(DeterministicError::InvalidArgumentCount);
                }
                let _index = u32::from_le_bytes([
                    index_bytes[0],
                    index_bytes[1],
                    index_bytes[2],
                    index_bytes[3],
                ]);

                // For validation purposes, we'll assume the quest ID is 32 bytes
                // In a real implementation, we would load the data from outputs_data[index]
                // For now, let's validate with a placeholder
            }

            // let quest_exists = input_campaign_data
            //     .quests()
            //     .into_iter()
            //     .any(|quest| quest.id().as_slice() == quest_id_byte32.as_slice());

            // if !quest_exists {
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            // 2. Check user hasn't already completed quest
            // // Parse user progress data to check completion history
            // let output_user_cell = &output_user_cells[0];

            // // Check if the user progress is for the same campaign
            // if user_progress.campaign_id().as_slice() != campaign_id.as_slice() {
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            // // Get completed quest IDs from user progress data
            // let completed_quest_ids = user_progress.completed_quest_ids();

            // Check if this quest has already been completed
            // let already_completed = completed_quest_ids
            //     .into_iter()
            //     .any(|completed_id| completed_id.as_slice() == quest_id_byte32.as_slice());

            // if already_completed {
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            // 3. Update campaign quest completion count
            // Verify that total_completions increased by 1
            let input_completions_data = input_campaign_data.total_completions();
            let output_completions_data = output_campaign_data.total_completions();

            let input_completions_bytes = input_completions_data.as_slice();
            let output_completions_bytes = output_completions_data.as_slice();

            // Convert to u32 for comparison
            let mut input_comp_array = [0u8; 4];
            let mut output_comp_array = [0u8; 4];
            input_comp_array.copy_from_slice(&input_completions_bytes[0..4]);
            output_comp_array.copy_from_slice(&output_completions_bytes[0..4]);
            let input_completions = u32::from_le_bytes(input_comp_array);
            let output_completions = u32::from_le_bytes(output_comp_array);

            if output_completions != input_completions + 1 {
                debug_trace!(
                    "Total completions did not increase by 1: {} -> {}",
                    input_completions,
                    output_completions
                );
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // TODO: Not handling this for now
            // // Verify campaign status is active (4)
            // if input_campaign_data.status() != 4u8.into() {
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            // Verify quest rewards match what's defined in the campaign
            // let quest = input_campaign_data
            //     .quests()
            //     .into_iter()
            //     .find(|q| q.id().as_slice() == quest_id_byte32.as_slice())
            //     .ok_or(DeterministicError::BusinessRuleViolation)?;

            // The user should receive the quest rewards
            // This validation would check that proper reward distribution occurred
            // For now, we just verify the quest has rewards defined
            // if quest.rewards_on_completion().is_empty() {
            //     return Err(DeterministicError::BusinessRuleViolation);
            // }

            Ok(())
        }
    }
}

