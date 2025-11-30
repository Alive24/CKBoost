extern crate alloc;

pub mod helper {
    use ckb_deterministic::debug_trace;
    use ckb_deterministic::errors::Error as DeterministicError;
    use ckb_std::ckb_constants::Source;
    use ckb_std::high_level::{load_cell_data, load_cell_type_hash};
    use ckboost_shared::types::protocol::ProtocolDataReader;
    use molecule::prelude::Reader;

    // 1.Validate a protocol cell's data against expected tipping code hash
    // 2. Validate connection to tipping type
    pub fn validate_protocol_cell(
        data: &[u8],
        expected_code_hash: &[u8],
    ) -> Result<(), DeterministicError> {
        let protocol_data =
            ProtocolDataReader::from_slice(data).map_err(|_| DeterministicError::Encoding)?;

        let tipping_code_hash = protocol_data
            .protocol_config()
            .script_code_hashes()
            .ckb_boost_tipping_type_code_hash();

        if tipping_code_hash.as_slice() == expected_code_hash {
            Ok(())
        } else {
            ("CellRelationshipRuleViolation: tipping code hash mismatch in protocol cell");
            ("  Expected: {:?}", expected_code_hash);
            ("  Got: {:?}", tipping_code_hash.as_slice());
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

    // **Script immutability**: Lock hash and type hash for tipping cells must remain unchanged
    pub fn script_immutability(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), DeterministicError> {
        // Get the tipping cells from input and output
        let input_tipping_cells = match context.input_cells.get_custom("tipping") {
            Some(cells) => cells,
            None => {
                // Only creation scenario when the recipe is create tipping has no input tipping cell
                if context.recipe.method_path_bytes().as_slice() == b"CKBoostTipping.update_tipping"
                {
                    return Ok(());
                } else {
                    debug_trace!("Missing tipping cell in input");
                    return Err(DeterministicError::CellCountViolation);
                }
            }
        };
        let output_tipping_cells = context.output_cells.get_custom("tipping").ok_or_else(|| {
            debug_trace!(
                "CellCountViolation: Missing tipping cell in output (script_immutability)"
            );
            DeterministicError::CellCountViolation
        })?;

        // For each tipping cell, verify lock and type hashes remain unchanged
        for (i, input_cell) in input_tipping_cells.iter().enumerate() {
            let output_cell = output_tipping_cells.get(i).ok_or_else(|| {
                debug_trace!(
                    "CellCountViolation: Output tipping cell {} not found (script_immutability)",
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
                    // Either input or output tipping cell has no type hash - this is not allowed
                    debug_trace!(
                        "CellRelationshipRuleViolation: tipping cell missing type hash at index {}",
                        i
                    );
                    debug_trace!("  Input has type: {}", input_cell.type_hash.is_some());
                    debug_trace!("  Output has type: {}", output_cell.type_hash.is_some());
                    return Err(DeterministicError::CellRelationshipRuleViolation);
                }
            }
        }

        Ok(())
    }
}

pub mod update_tipping {
    use alloc::{string::ToString, vec};
    use ckb_deterministic::{
        cell_classifier::RuleBasedClassifier,
        validation::{CellCountConstraint, TransactionValidationRules},
    };

    pub fn get_rules() -> TransactionValidationRules<RuleBasedClassifier> {
        TransactionValidationRules::new(b"CKBoostTipping.update_tipping".to_vec())
            .with_arguments(1)
            .with_custom_cell(
                "tipping",
                CellCountConstraint::at_most(1),
                CellCountConstraint::exactly(1),
            )
            .with_business_rule(
                "automatic_execution".to_string(),
                "When a tipping receives sufficient approval, it must be automatically executed"
                    .to_string(),
                vec!["protocol".to_string()],
                business_logic::automatic_execution,
            )
            .with_business_rule(
                "approval_restrictions".to_string(),
                "Cannot approve tippings that are already fully approved or have expired"
                    .to_string(),
                vec!["protocol".to_string()],
                business_logic::approval_restrictions,
            )
    }

    pub mod business_logic {
        use alloc::vec::Vec;
        use ckb_deterministic::cell_classifier::RuleBasedClassifier;
        use ckb_deterministic::debug_trace;
        use ckb_deterministic::errors::Error as DeterministicError;
        use ckb_std::high_level::load_cell_capacity;
        use ckboost_shared::cell_collector::get_udt_identifier;
        use ckboost_shared::generated::ckboost::ProtocolData;
        use ckboost_shared::protocol_data::get_protocol_data;
        use ckboost_shared::transaction_context::TransactionContext;
        use ckboost_shared::types::TippingDataReader;
        use molecule::prelude::*;

        /// **Automatic execution**: When a tipping receives sufficient approval,
        /// it must be automatically executed with funds transferred to the target address
        pub fn automatic_execution(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            debug_trace!("Starting automatic_execution");
            let output_tipping = context
                .output_cells
                .get_custom("tipping")
                .ok_or(DeterministicError::CellCountViolation)?
                .get(0)
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_tipping_data = TippingDataReader::from_slice(&output_tipping.data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_status = output_tipping_data.status().raw_data();
            // Check approval requirements thresholds
            let protocol_data = match get_protocol_data() {
                Ok(pd) => pd,
                Err(_) => return Err(DeterministicError::BusinessRuleViolation),
            };
            let approval_requirement_thresholds = protocol_data
                .tipping_config()
                .approval_requirement_thresholds();

            let mut filtered_approval_requirement_thresholds = Vec::new();

            let rewards = output_tipping_data.rewards().to_entity();

            let mut raw_ckb_amount = [0u8; 16];
            raw_ckb_amount.copy_from_slice(rewards.ckb_amount().as_slice());
            let ckb_amount = u128::from_le_bytes(raw_ckb_amount);
            debug_trace!("Automatic execution: CKB reward: {}", ckb_amount);

            for threshold in approval_requirement_thresholds {
                let mut raw_threshold = [0u8; 16];
                raw_threshold.copy_from_slice(threshold.as_slice());
                let threshold = u128::from_le_bytes(raw_threshold);
                if ckb_amount >= threshold {
                    filtered_approval_requirement_thresholds.push(threshold);
                }
            }

            let required_approvals = filtered_approval_requirement_thresholds.len() as u8 + 1;
            debug_trace!(
                "Automatic execution: Required approvals: {}",
                required_approvals
            );
            let output_supporter_lock_hashes =
                output_tipping_data.supporter_lock_hashes().to_entity();
            debug_trace!(
                "Automatic execution: Output supporters: {}",
                output_supporter_lock_hashes.len()
            );

            if output_supporter_lock_hashes.len() as u8 >= required_approvals {
                if output_status != b"granted" {
                    debug_trace!("BusinessRuleViolation: Output tipping status is not granted while supporters are greater or equal to required approvals");
                    debug_trace!("  Output status: {:?}", output_status);
                    return Err(DeterministicError::BusinessRuleViolation);
                }
            } else {
                if output_status == b"granted" {
                    debug_trace!("BusinessRuleViolation: Output tipping status is granted while supporters are less than required approvals");
                    debug_trace!("  Output status: {:?}", output_status);
                    return Err(DeterministicError::BusinessRuleViolation);
                } else {
                    return Ok(());
                }
            }

            // ISSUE #13: Other forms of rewards are not permitted yet
            if rewards.udt_assets().len() > 0 {
                debug_trace!("BusinessRuleViolation: UDT rewards are not permitted yet");
                return Err(DeterministicError::BusinessRuleViolation);
            }
            if rewards.nft_assets().len() != 0 {
                debug_trace!("BusinessRuleViolation: NFT rewards are not permitted yet");
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // NOTE: Amount checks are in funding lock

            Ok(())
        }

        /// **Approval restrictions**:
        pub fn approval_restrictions(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            debug_trace!("Starting approval_restrictions");
            let output_tipping = context
                .output_cells
                .get_custom("tipping")
                .ok_or(DeterministicError::CellCountViolation)?
                .get(0)
                .ok_or(DeterministicError::CellCountViolation)?;

            let output_tipping_data = TippingDataReader::from_slice(&output_tipping.data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_status = output_tipping_data.status().to_entity();

            let output_proposer_lock_hash = output_tipping_data.proposer_lock_hash().as_slice();
            let protocol_data = match get_protocol_data() {
                Ok(pd) => pd,
                Err(_) => return Err(DeterministicError::BusinessRuleViolation),
            };
            let endorser_whitelist = protocol_data.endorsers_whitelist();
            let admin_list = protocol_data.protocol_config().admin_lock_hash_vec();
            // 1. The proposer must be either in the endorser_whitelist or admin_list
            if !endorser_whitelist
                .clone()
                .into_iter()
                .any(|h| h.endorser_lock_hash().as_slice() == output_proposer_lock_hash)
                && !admin_list
                    .clone()
                    .into_iter()
                    .any(|h| h.as_slice() == output_proposer_lock_hash)
            {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            let output_supporter_lock_hashes =
                output_tipping_data.supporter_lock_hashes().to_entity();
            // 2. If supporters are added, the first supporter must be in the admin list.
            if output_supporter_lock_hashes.len() > 0 {
                if !admin_list.clone().into_iter().any(|h| {
                    h.as_slice() == output_supporter_lock_hashes.get(0).unwrap().as_slice()
                }) {
                    return Err(DeterministicError::BusinessRuleViolation);
                } else {
                    if output_status.as_slice() == b"created" {
                        debug_trace!("BusinessRuleViolation: If acquired a admin as a supporter, the status must be changed to approved");
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                }
            }
            // 3. The following supporters must be either in the endorser_whitelist or admin_list
            for supporter_lock_hash in output_supporter_lock_hashes.clone().into_iter() {
                if supporter_lock_hash.as_slice()
                    == output_supporter_lock_hashes.get(0).unwrap().as_slice()
                {
                    continue;
                }
                if !endorser_whitelist
                    .clone()
                    .into_iter()
                    .any(|h| h.endorser_lock_hash().as_slice() == supporter_lock_hash.as_slice())
                    && !admin_list
                        .clone()
                        .into_iter()
                        .any(|h| h.as_slice() == supporter_lock_hash.as_slice())
                {
                    return Err(DeterministicError::BusinessRuleViolation);
                }
            }
            // Get Input tipping
            debug_trace!("Getting input tipping");
            let input_tipping_opt = context.input_cells.get_custom("tipping");
            match input_tipping_opt {
                None => {
                    debug_trace!("Creating new tipping");
                    let output_status = output_tipping_data.status().to_entity();
                    // 4. If creating a new tipping, the status must be created
                    if output_status.raw_data().iter().as_slice() != b"created" {
                        debug_trace!(
                            "BusinessRuleViolation: Output tipping status is not created ({:?})",
                            b"created"
                        );
                        debug_trace!("  Output status: {:?}", output_status);
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                    // 5. If creating a new tipping, proposer must have a proxy cell in in the input
                    if !context
                        .input_cells
                        .get_simple_ckb()
                        .iter()
                        .any(|c| c.lock_hash.as_slice() == output_proposer_lock_hash)
                    {
                        debug_trace!("BusinessRuleViolation: Proposer must have a proxy cell in in the input");
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                    // 6. For newly created tippings, supporters must be empty
                    if output_supporter_lock_hashes.len() > 0 {
                        debug_trace!(
                            "BusinessRuleViolation: Output tipping supporters must be empty"
                        );
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                }
                Some(input_tipping) => {
                    if input_tipping.len() != 1 {
                        debug_trace!("BusinessRuleViolation: Input tipping cell count is not 1 while updating existing tipping");
                        return Err(DeterministicError::BusinessRuleViolation);
                    }
                    debug_trace!("Updating existing tipping");
                    let input_tipping_data = TippingDataReader::from_slice(&input_tipping[0].data)
                        .map_err(|_| DeterministicError::Encoding)?;
                    let input_supporter_lock_hashes =
                        input_tipping_data.supporter_lock_hashes().to_entity();
                    let input_status = input_tipping_data.status().to_entity();
                    let status_changed =
                        input_status.as_slice() != output_status.as_slice();
                    if status_changed {
                        let has_admin_input = context
                            .input_cells
                            .get_simple_ckb()
                            .iter()
                            .any(|c| {
                                admin_list
                                    .clone()
                                    .into_iter()
                                    .any(|h| h.as_slice() == c.lock_hash.as_slice())
                            });
                        if !has_admin_input {
                            debug_trace!("BusinessRuleViolation: Status changes require an admin input cell");
                            return Err(DeterministicError::BusinessRuleViolation);
                        }
                    }
                    // 8. You should not be able to update a tipping that is already granted
                    if input_status.as_slice() == b"granted" {
                        debug_trace!("BusinessRuleViolation: Input tipping status is granted");
                        return Err(DeterministicError::BusinessRuleViolation);
                    } else {
                        let mut raw_creation_timestamp = [0u8; 8];
                        raw_creation_timestamp.copy_from_slice(
                            input_tipping_data
                                .metadata()
                                .creation_timestamp()
                                .to_entity()
                                .as_slice(),
                        );
                        let mut raw_expiration_duration = [0u8; 8];
                        raw_expiration_duration.copy_from_slice(
                            protocol_data
                                .tipping_config()
                                .expiration_duration()
                                .as_slice(),
                        );

                        let creation_timestamp = u64::from_le_bytes(raw_creation_timestamp);
                        let expiration_duration = u64::from_le_bytes(raw_expiration_duration);
                        // 9. If updating an existing tipping, the creation timestamp plus expiration duration must be greater than current timestamp (skipping this for now)
                        if creation_timestamp + expiration_duration > 0 {
                            debug_trace!("(Skipping) BusinessRuleViolation: Input tipping creation timestamp is greater than current timestamp. Skipping this check for now.");
                            // return Err(DeterministicError::BusinessRuleViolation);
                        }
                    }
                    // If neither supporters lock hashes nor status change, return Ok
                    if input_supporter_lock_hashes.as_slice()
                        == output_supporter_lock_hashes.as_slice()
                        && input_status.as_slice() == output_status.as_slice()
                    {
                        return Ok(());
                    } else {
                        // Changes are made to either lock hashes or status
                        // Supporter lock hashes can only be added, not removed
                        if output_supporter_lock_hashes.len() < input_supporter_lock_hashes.len() {
                            return Err(DeterministicError::BusinessRuleViolation);
                        }

                        // Check if all preexisting supporter lock hashes are matching one by one in the output too
                        for (i, lock_hash) in
                            input_supporter_lock_hashes.clone().into_iter().enumerate()
                        {
                            if output_supporter_lock_hashes.get(i).unwrap().as_slice()
                                != lock_hash.as_slice()
                            {
                                debug_trace!(
                                    "BusinessRuleViolation: Preexisting supporter lock hash {:?} does not match in the output at index {}",
                                    lock_hash.as_slice(), i
                                );
                                return Err(DeterministicError::BusinessRuleViolation);
                            }
                        }
                        // Collect all new lock hashes in the output
                        let new_lock_hashes = output_supporter_lock_hashes
                            .clone()
                            .into_iter()
                            .filter(|h| {
                                !input_supporter_lock_hashes
                                    .clone()
                                    .into_iter()
                                    .any(|h| h.as_slice() == h.as_slice())
                            })
                            .collect::<Vec<_>>();
                        let input_ckb_cells = context.input_cells.simple_ckb_cells.clone();
                        // each new lock hash must have a corresponding ckb cell in the input
                        for lock_hash in new_lock_hashes {
                            if !input_ckb_cells
                                .iter()
                                .any(|c| c.lock_hash.as_slice() == lock_hash.as_slice())
                            {
                                return Err(DeterministicError::BusinessRuleViolation);
                            }
                        }
                    }
                }
            }
            Ok(())
        }

        /// **Data immutability**: All other protocol data must remain unchanged
        /// during tipping updates
        pub fn data_immutability(
            context: &TransactionContext<RuleBasedClassifier>,
        ) -> Result<(), DeterministicError> {
            debug_trace!("Starting data_immutability");
            // Get protocol cells
            let input_protocol_cells = context
                .input_cells
                .get_custom("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;
            let output_protocol_cells = context
                .output_cells
                .get_custom("protocol")
                .ok_or(DeterministicError::CellCountViolation)?;

            // Parse protocol data
            let input_protocol_data = ProtocolData::from_slice(&input_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;
            let output_protocol_data = ProtocolData::from_slice(&output_protocol_cells[0].data)
                .map_err(|_| DeterministicError::Encoding)?;

            // Check all fields except tippings remain unchanged

            // tippings_approved must be unchanged
            if input_protocol_data.tippings_approved().as_slice()
                != output_protocol_data.tippings_approved().as_slice()
            {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // tipping_config must be unchanged
            if input_protocol_data.tipping_config().as_slice()
                != output_protocol_data.tipping_config().as_slice()
            {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // endorsers_whitelist must be unchanged
            if input_protocol_data.endorsers_whitelist().as_slice()
                != output_protocol_data.endorsers_whitelist().as_slice()
            {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // protocol_config must be unchanged
            if input_protocol_data.protocol_config().as_slice()
                != output_protocol_data.protocol_config().as_slice()
            {
                return Err(DeterministicError::BusinessRuleViolation);
            }

            // Note: last_updated is allowed to change as it tracks update timestamp

            Ok(())
        }
        // **Tipping tipping immutability**: Tipping tipping data must remain unchanged during protocol updates to maintain tipping integrity
    }
}
