use alloc::vec;
use alloc::vec::Vec;
use blake2b_ref::Blake2bBuilder;
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, create_recipe_with_args, create_recipe_with_reference, debug_info, debug_trace, serialize_transaction_recipe, transaction_context::TransactionContext, transaction_recipe::TransactionRecipeExt
};
use ckb_ssri_std::utils::high_level::{find_cell_by_out_point, find_out_point_by_type};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{
        packed::{
            Byte32Vec, BytesOpt, BytesVecBuilder, CellDepVecBuilder, CellInput,
            CellInputVecBuilder, CellOutputBuilder, CellOutputVecBuilder, RawTransactionBuilder,
            ScriptBuilder, ScriptOptBuilder, Transaction, TransactionBuilder, WitnessArgsBuilder,
        },
        prelude::*,
    },
    debug,
    high_level::load_script
};
use ckboost_shared::{
    types::{Byte32 as SharedByte32, CampaignData, ConnectedTypeID, QuestData, UserData},
    Error,
};

pub struct CKBoostCampaignType;

use crate::{recipes, ssri::CKBoostCampaign};

impl CKBoostCampaign for CKBoostCampaignType {
    fn update_campaign(
        tx: Option<Transaction>,
        campaign_data: CampaignData,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostCampaignType::update_campaign - Starting campaign update");

        // Initialize transaction builders
        let tx_builder = match tx {
            Some(ref tx) => tx.clone().as_builder(),
            None => TransactionBuilder::default(),
        };
        let raw_tx_builder = match tx {
            Some(ref tx) => tx.clone().raw().as_builder(),
            None => RawTransactionBuilder::default(),
        };

        // Initialize builders from existing transaction or create new
        let mut cell_input_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().inputs().as_builder(),
            None => CellInputVecBuilder::default(),
        };

        let mut cell_output_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs().as_builder(),
            None => CellOutputVecBuilder::default(),
        };

        let mut outputs_data_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs_data().as_builder(),
            None => BytesVecBuilder::default(),
        };

        let cell_dep_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().cell_deps().as_builder(),
            None => CellDepVecBuilder::default(),
        };

        // Get context script and parse ConnectedTypeID from args
        let current_script = load_script()?;
        debug_info!("current_script: {:?}", current_script);

        let args = current_script.args();
        let connected_type_id = ConnectedTypeID::from_slice(&args.raw_data())
            .map_err(|_| Error::InvalidConnectedTypeId);

        // Track the index where the campaign cell will be in the inputs
        let campaign_input_index: usize;

        // Track if we have a campaign output and at what index
        let campaign_output_index: Option<usize>;

        // If campaign_type_id is empty, we're creating a new campaign cell
        // Otherwise, we should try to find the existing one

        match connected_type_id {
            Ok(connected_type_id) => {
                debug_trace!("Found existing campaign cell, updating it");

                // The type_id in ConnectedTypeID is the actual campaign type ID
                let _campaign_type_id = connected_type_id.type_id();
                let _connected_key = connected_type_id.connected_key();

                // Try to find existing campaign cell with this type ID
                let campaign_outpoint = find_out_point_by_type(current_script.clone())?;

                // The campaign cell will be added at the current end of inputs
                campaign_input_index = tx.as_ref().map(|t| t.raw().inputs().len()).unwrap_or(0);

                // Add campaign cell as input
                let campaign_input = CellInput::new_builder()
                    .previous_output(campaign_outpoint.clone())
                    .build();
                cell_input_vec_builder = cell_input_vec_builder.push(campaign_input);

                // Get the current campaign cell to preserve lock script
                let current_campaign_cell = find_cell_by_out_point(campaign_outpoint)
                    .map_err(|_| Error::CampaignCellNotFound)?;

                // Track that we're adding a campaign output at the current output count
                campaign_output_index =
                    Some(tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0));

                // Create output campaign cell with updated data
                let new_campaign_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(current_script))
                            .build(),
                    )
                    .lock(current_campaign_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_campaign_output);
            }
            Err(_) => {
                debug_trace!("No campaign cell found. Creating a new campaign cell.");

                // In creation case, campaign cell doesn't exist as input
                // But we still need a witness for the first input (used for type ID calculation)
                campaign_input_index = 0;

                // Campaign creation case - need type ID
                // For type ID calculation, we need at least one input
                let (first_input, output_index) = match tx {
                    Some(ref tx) => {
                        // Use existing transaction's first input and next output index
                        let first_input = tx.raw().inputs().get(0)
                            .ok_or_else(|| {
                                debug_trace!("Transaction has no inputs. Use ccc.Transaction.completeInputsAtLeastOne(signer) to add at least one input.");
                                Error::MissingTransactionInput
                            })?;
                        (first_input, tx.raw().outputs().len())
                    }
                    None => {
                        // No transaction provided - we cannot create a campaign cell without inputs
                        debug_trace!("No transaction provided. Create a transaction with at least one input using ccc.Transaction.completeInputsAtLeastOne(signer).");
                        return Err(Error::MissingTransactionInput);
                    }
                };

                // Calculate type ID based on first input and output index
                let mut blake2b = Blake2bBuilder::new(32)
                    .personal(b"ckb-default-hash")
                    .build();
                blake2b.update(first_input.as_slice());
                blake2b.update(&output_index.to_le_bytes());
                let mut type_id = [0u8; 32];
                blake2b.finalize(&mut type_id);

                // Create ConnectedTypeID with the new type ID and protocol reference
                let new_connected_type_id = ConnectedTypeID::new_builder()
                    .type_id(SharedByte32::from_slice(&type_id).unwrap())
                    // Leave connected_key empty for now and let dapp fill it in with the correct protocol cell type hash
                    .connected_key(SharedByte32::from_slice(&[0u8; 32]).unwrap())
                    .build();

                // Create the type script with ConnectedTypeID as args
                let new_type_script = ScriptBuilder::default()
            .code_hash(current_script.code_hash())
            .hash_type(current_script.hash_type())
                    .args(new_connected_type_id.as_bytes().pack())
            .build();

                // Get first input cell to use its lock for the new campaign cell
                let first_input_outpoint = first_input.previous_output();
                let first_input_cell = find_cell_by_out_point(first_input_outpoint)?;

                // Track that we're adding a campaign output at the current output count
                campaign_output_index =
                    Some(tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0));

                // Create new campaign cell
                let new_campaign_output = CellOutputBuilder::default()
            .type_(
                ScriptOptBuilder::default()
                            .set(Some(new_type_script))
                    .build(),
            )
                    .lock(first_input_cell.lock())
                    .capacity(0u64.pack())
            .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_campaign_output);
            }
        }

        // Serialize and add updated campaign data
        let campaign_data_bytes = campaign_data.as_bytes();
        outputs_data_builder = outputs_data_builder.push(campaign_data_bytes.pack());

        // Create the recipe witness using ckb_deterministic's helper function
        let output_data_index = tx
            .as_ref()
            .map(|t| t.raw().outputs_data().len())
            .unwrap_or(0) as u32;

        // Create recipe with output data reference
        let recipe = create_recipe_with_args(
            "CKBoostCampaign.update_campaign",
            vec![create_recipe_with_reference(
                Source::Output,
                output_data_index,
            )],
        )?;

        // Serialize the recipe to bytes
        let recipe_bytes = serialize_transaction_recipe(&recipe);

        // Create WitnessArgs with recipe in output_type field
        let witness_args = WitnessArgsBuilder::default()
            .lock(BytesOpt::default())
            .input_type(BytesOpt::default())
            .output_type(
                BytesOpt::new_builder()
                    .set(Some(recipe_bytes.pack()))
                    .build(),
            )
            .build();

        // Determine where to place the witness
        let witness_index = match campaign_output_index {
            Some(output_idx) => {
                debug_trace!("Placing recipe witness at output index: {}", output_idx);
                output_idx
            }
            None => {
                debug_trace!(
                    "No campaign output, placing recipe witness at input index: {}",
                    campaign_input_index
                );
                campaign_input_index
            }
        };

        // Build witnesses vector with recipe witness at the correct index
        let witnesses_builder = match tx {
            Some(ref tx) => {
                let mut builder = BytesVecBuilder::default();
                let witnesses = tx.witnesses();

                // We need to ensure witnesses for all inputs
                let total_inputs = cell_input_vec_builder.build().len();

                // Copy existing witnesses or create empty ones up to witness_index
                for i in 0..witness_index {
                    match witnesses.get(i) {
                        Some(witness) => {
                            builder = builder.push(witness);
                        }
                        None => {
                            let empty_witness = WitnessArgsBuilder::default().build();
                            builder = builder.push(empty_witness.as_bytes().pack());
                        }
                    }
                }

                // Add the recipe witness at witness_index
                builder = builder.push(witness_args.as_bytes().pack());

                // Add remaining witnesses after witness_index
                for i in (witness_index + 1)..total_inputs {
                    match witnesses.get(i) {
                        Some(witness) => {
                            builder = builder.push(witness);
                        }
                        None => {
                            let empty_witness = WitnessArgsBuilder::default().build();
                            builder = builder.push(empty_witness.as_bytes().pack());
                        }
                    }
                }

                // Add any extra witnesses that might exist beyond input count
                for i in total_inputs..witnesses.len() {
                    match witnesses.get(i) {
                        Some(witness) => {
                            builder = builder.push(witness);
                        }
                        None => {
                            // Should not happen since we're iterating within bounds, but handle gracefully
                        }
                    }
                }

                builder
            }
            None => {
                // No existing transaction, just add the WitnessArgs with recipe
                BytesVecBuilder::default().push(witness_args.as_bytes().pack())
            }
        };

        // Build the complete transaction
        Ok(tx_builder
            .raw(
                raw_tx_builder
                    .version(tx.clone().map(|t| t.raw().version()).unwrap_or_default())
                    .cell_deps(cell_dep_vec_builder.build())
                    .header_deps(
                        tx.clone()
                            .map(|t| t.raw().header_deps())
                            .unwrap_or_else(|| Byte32Vec::default()),
                    )
                    .inputs(cell_input_vec_builder.build())
                    .outputs(cell_output_vec_builder.build())
                    .outputs_data(outputs_data_builder.build())
                    .build(),
            )
            .witnesses(witnesses_builder.build())
            .build())
    }

    fn verify_update_campaign(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("Starting verify_update_campaign");

        // Use the recipe validation rules
        let validation_rules = recipes::update_campaign::get_rules();
        debug_trace!("Got validation rules, starting validation");
        
        let validation_result = validation_rules.validate(&context);
        debug_trace!("Validation result: {:?}", validation_result);
        
        match validation_result {
            Ok(()) => {
                debug_trace!("Campaign update transaction validation completed successfully");
                Ok(())
            },
            Err(e) => {
                debug_trace!("Validation failed with error: {:?}", e);
                Err(e.into())
            }
        }
    }

    fn approve_completion(
        tx: Option<Transaction>,
        mut campaign_data: CampaignData,
        quest_id: u32,
        user_type_ids: Vec<SharedByte32>,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostCampaignType::approve_completion - Starting quest completion approval");
        debug_trace!("Quest ID: {}, User Type IDs count: {}", quest_id, user_type_ids.len());

        // Initialize transaction builders
        let tx_builder = match tx {
            Some(ref tx) => tx.clone().as_builder(),
            None => TransactionBuilder::default(),
        };
        let raw_tx_builder = match tx {
            Some(ref tx) => tx.clone().raw().as_builder(),
            None => RawTransactionBuilder::default(),
        };

        // Initialize builders from existing transaction or create new
        let cell_input_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().inputs().as_builder(),
            None => CellInputVecBuilder::default(),
        };

        let mut cell_output_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs().as_builder(),
            None => CellOutputVecBuilder::default(),
        };

        let mut outputs_data_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs_data().as_builder(),
            None => BytesVecBuilder::default(),
        };

        let cell_dep_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().cell_deps().as_builder(),
            None => CellDepVecBuilder::default(),
        };

        // Verify campaign is active (status = 4)
        if campaign_data.status() != 4u8.into() {
            return Err(Error::CampaignNotActive);
        }

        // Find the quest and update accepted_submission_user_type_ids
        let quests = campaign_data.quests();
        let mut updated_quests = vec![];
        let mut quest_found = false;
        let mut _points_to_mint = 0u64;

        for i in 0..quests.len() {
            let quest = quests.get(i).unwrap();
            if quest.quest_id().as_slice() == &quest_id.to_le_bytes() {
                quest_found = true;
                
                // Get points amount from quest rewards
                let rewards = quest.rewards_on_completion();
                if rewards.len() > 0 {
                    let reward = rewards.get(0).unwrap();
                    let points_amount = reward.points_amount();
                    let points_bytes = points_amount.as_slice();
                    if points_bytes.len() >= 8 {
                        _points_to_mint = u64::from_le_bytes([
                            points_bytes[0], points_bytes[1], points_bytes[2], points_bytes[3],
                            points_bytes[4], points_bytes[5], points_bytes[6], points_bytes[7],
                        ]);
                    }
                }

                // Update accepted_submission_user_type_ids
                let current_accepted = quest.accepted_submission_user_type_ids();
                let mut accepted_ids = vec![];
                
                // Copy existing accepted IDs
                for j in 0..current_accepted.len() {
                    accepted_ids.push(current_accepted.get(j).unwrap());
                }
                
                // Add new user type IDs
                for user_type_id in &user_type_ids {
                    // Check if already approved
                    let mut already_approved = false;
                    for accepted_id in &accepted_ids {
                        if accepted_id.as_slice() == user_type_id.as_slice() {
                            already_approved = true;
                            break;
                        }
                    }
                    
                    if !already_approved {
                        accepted_ids.push(user_type_id.clone());
                    }
                }

                // Create updated quest
                let updated_quest = QuestData::new_builder()
                    .quest_id(quest.quest_id())
                    .metadata(quest.metadata())
                    .rewards_on_completion(quest.rewards_on_completion())
                    .accepted_submission_user_type_ids(
                        ckboost_shared::generated::ckboost::Byte32Vec::new_builder()
                            .extend(accepted_ids)
                            .build()
                    )
                    .completion_deadline(quest.completion_deadline())
                    .status(quest.status())
                    .sub_tasks(quest.sub_tasks())
                    .points(quest.points())
                    .completion_count(quest.completion_count())
                    .build();
                
                updated_quests.push(updated_quest);
            } else {
                updated_quests.push(quest.clone());
            }
        }

        if !quest_found {
            return Err(Error::InvalidQuestData);
        }

        // Update campaign total_completions
        let current_completions_data = campaign_data.total_completions();
        let current_completions_bytes = current_completions_data.as_slice();
        let current_completions = u32::from_le_bytes([
            current_completions_bytes[0],
            current_completions_bytes[1],
            current_completions_bytes[2],
            current_completions_bytes[3],
        ]);
        let new_completions = current_completions + user_type_ids.len() as u32;

        // Create updated campaign data
        let updated_campaign_data = CampaignData::new_builder()
            .endorser(campaign_data.endorser())
            .created_at(campaign_data.created_at())
            .starting_time(campaign_data.starting_time())
            .ending_time(campaign_data.ending_time())
            .rules(campaign_data.rules())
            .metadata(campaign_data.metadata())
            .status(campaign_data.status())
            .quests(
                ckboost_shared::generated::ckboost::QuestDataVec::new_builder()
                    .extend(updated_quests)
                    .build()
            )
            .participants_count(campaign_data.participants_count())
            .total_completions(
                ckboost_shared::generated::ckboost::Uint32::from_slice(
                    &new_completions.to_le_bytes(),
                )
                .unwrap(),
            )
            .build();

        // Create output campaign cell with updated data
        let campaign_output_index = tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0);
        
        // Create a placeholder output for the campaign (actual cell will be added by the transaction builder)
        // In SSRI-VM context, we just need to prepare the data
        let campaign_output = CellOutputBuilder::default()
            .capacity(0u64.pack()) // Placeholder capacity
            .build();
        cell_output_vec_builder = cell_output_vec_builder.push(campaign_output);

        // Serialize and add updated campaign data
        let updated_campaign_data_bytes = updated_campaign_data.as_bytes();
        outputs_data_builder = outputs_data_builder.push(updated_campaign_data_bytes.pack());

        // Note: Points minting will be handled by the Points UDT contract
        // The campaign contract only updates the accepted_submission_user_type_ids
        // The actual Points cells creation happens in the transaction builder

        // Create the recipe witness
        // Encode quest_id and user_type_ids in outputs_data
        let quest_id_index = outputs_data_builder.build().len() as u32;
        outputs_data_builder = outputs_data_builder.push(quest_id.to_le_bytes().to_vec().pack());
        
        // Encode user_type_ids as a concatenated byte array
        let mut user_ids_bytes = vec![];
        for user_type_id in &user_type_ids {
            user_ids_bytes.extend_from_slice(user_type_id.as_slice());
        }
        let user_ids_index = outputs_data_builder.build().len() as u32;
        outputs_data_builder = outputs_data_builder.push(user_ids_bytes.pack());

        let recipe = create_recipe_with_args(
            "CKBoostCampaign.approve_completion",
            vec![
                create_recipe_with_reference(Source::Output, quest_id_index),
                create_recipe_with_reference(Source::Output, user_ids_index),
            ],
        )?;

        // Serialize the recipe to bytes
        let recipe_bytes = serialize_transaction_recipe(&recipe);

        // Create WitnessArgs with recipe in output_type field
        let witness_args = WitnessArgsBuilder::default()
            .lock(BytesOpt::default())
            .input_type(BytesOpt::default())
            .output_type(
                BytesOpt::new_builder()
                    .set(Some(recipe_bytes.pack()))
                    .build(),
            )
            .build();

        // Build witnesses vector with recipe witness at campaign output index
        let witnesses_builder = match tx {
            Some(ref tx) => {
                let mut builder = BytesVecBuilder::default();
                let witnesses = tx.witnesses();

                // Copy existing witnesses up to campaign_output_index
                for i in 0..campaign_output_index {
                    match witnesses.get(i) {
                        Some(witness) => {
                            builder = builder.push(witness);
                        }
                        None => {
                            let empty_witness = WitnessArgsBuilder::default().build();
                            builder = builder.push(empty_witness.as_bytes().pack());
                        }
                    }
                }

                // Add the recipe witness at campaign_output_index
                builder = builder.push(witness_args.as_bytes().pack());

                // Add remaining witnesses
                for i in campaign_output_index + 1..witnesses.len() {
                    match witnesses.get(i) {
                        Some(witness) => {
                            builder = builder.push(witness);
                        }
                        None => {
                            let empty_witness = WitnessArgsBuilder::default().build();
                            builder = builder.push(empty_witness.as_bytes().pack());
                        }
                    }
                }

                builder
            }
            None => BytesVecBuilder::default().push(witness_args.as_bytes().pack()),
        };

        // Build the complete transaction
        Ok(tx_builder
            .raw(
                raw_tx_builder
                    .version(tx.clone().map(|t| t.raw().version()).unwrap_or_default())
                    .cell_deps(cell_dep_vec_builder.build())
                    .header_deps(
                        tx.clone()
                            .map(|t| t.raw().header_deps())
                            .unwrap_or_else(|| Byte32Vec::default()),
                    )
                    .inputs(cell_input_vec_builder.build())
                    .outputs(cell_output_vec_builder.build())
                    .outputs_data(outputs_data_builder.build())
                    .build(),
            )
            .witnesses(witnesses_builder.build())
            .build())
    }
    fn verify_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("Starting verify_approve_completion");

        // Get the transaction recipe
        let recipe = context.recipe.clone();
        debug_trace!("Recipe method path: {:?}", recipe.method_path_bytes());

        // Verify method path
        if recipe.method_path_bytes() != b"CKBoostCampaign.approve_completion" {
            debug_trace!(
                "Invalid method path: expected 'CKBoostCampaign.approve_completion', got '{:?}'",
                recipe.method_path_bytes()
            );
            return Err(Error::WrongMethodPath);
        }

        // Use the predefined rules from recipes module
        let rules = recipes::approve_completion::get_rules();

        // Execute validation
        rules.validate(context)?;

        debug_trace!("verify_approve_completion completed successfully");
        Ok(())
    }
}