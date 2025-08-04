use alloc::vec;
use blake2b_ref::Blake2bBuilder;
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, create_recipe_with_args, create_recipe_with_reference,
    serialize_transaction_recipe, transaction_context::TransactionContext,
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
    high_level::load_script,
};
use ckboost_shared::{
    types::{Byte32 as SharedByte32, CampaignData, ConnectedTypeID, QuestData},
    Error,
};

pub struct CKBoostCampaignType;

use crate::{recipes, ssri::CKBoostCampaign};

impl CKBoostCampaign for CKBoostCampaignType {
    fn update_campaign(
        tx: Option<Transaction>,
        campaign_data: CampaignData,
    ) -> Result<Transaction, Error> {
        debug!("CKBoostCampaignType::update_campaign - Starting campaign update");

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
        debug!("current_script: {:?}", current_script);

        let args = current_script.args();
        let connected_type_id = ConnectedTypeID::from_slice(&args.as_slice())
            .map_err(|_| Error::MoleculeVerificationError);

        // Track the index where the campaign cell will be in the inputs
        let campaign_input_index: usize;

        // Track if we have a campaign output and at what index
        let campaign_output_index: Option<usize>;

        // If campaign_type_id is empty, we're creating a new campaign cell
        // Otherwise, we should try to find the existing one

        match connected_type_id {
            Ok(connected_type_id) => {
                debug!("Found existing campaign cell, updating it");

                // The type_id in ConnectedTypeID is the actual campaign type ID
                let campaign_type_id = connected_type_id.type_id();
                let connected_type_hash = connected_type_id.connected_type_hash();

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
                debug!("No campaign cell found. Creating a new campaign cell.");

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
                                debug!("Transaction has no inputs. Use ccc.Transaction.completeInputsAtLeastOne(signer) to add at least one input.");
                                Error::MissingTransactionInput
                            })?;
                        (first_input, tx.raw().outputs().len())
                    }
                    None => {
                        // No transaction provided - we cannot create a campaign cell without inputs
                        debug!("No transaction provided. Create a transaction with at least one input using ccc.Transaction.completeInputsAtLeastOne(signer).");
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
                    // Leave connected_type_hash empty for now and let dapp fill it in with the correct protocol cell type hash
                    .connected_type_hash(SharedByte32::from_slice(&[0u8; 32]).unwrap())
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
        let witness_index = if let Some(output_idx) = campaign_output_index {
            debug!("Placing recipe witness at output index: {}", output_idx);
            output_idx
        } else {
            debug!(
                "No campaign output, placing recipe witness at input index: {}",
                campaign_input_index
            );
            campaign_input_index
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
                    if let Some(witness) = witnesses.get(i) {
                        builder = builder.push(witness);
                    } else {
                        let empty_witness = WitnessArgsBuilder::default().build();
                        builder = builder.push(empty_witness.as_bytes().pack());
                    }
                }

                // Add the recipe witness at witness_index
                builder = builder.push(witness_args.as_bytes().pack());

                // Add remaining witnesses after witness_index
                for i in (witness_index + 1)..total_inputs {
                    if let Some(witness) = witnesses.get(i) {
                        builder = builder.push(witness);
                    } else {
                        let empty_witness = WitnessArgsBuilder::default().build();
                        builder = builder.push(empty_witness.as_bytes().pack());
                    }
                }

                // Add any extra witnesses that might exist beyond input count
                for i in total_inputs..witnesses.len() {
                    if let Some(witness) = witnesses.get(i) {
                        builder = builder.push(witness);
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
        debug!("Starting verify_update_campaign");

        // Use the recipe validation rules
        let validation_rules = recipes::update_campaign::get_rules();
        validation_rules.validate(&context)?;

        debug!("Campaign update transaction validation completed successfully");
        Ok(())
    }

    fn approve_completion(
        tx: Option<Transaction>,
        campaign_id: SharedByte32,
        quest_data: QuestData,
    ) -> Result<Transaction, Error> {
        debug!("CKBoostCampaignType::approve_completion - Starting quest completion");

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

        // Get current script
        let current_script = load_script()?;

        // Find campaign cell by ID
        // In a real implementation, this would search through cells to find the one with matching campaign_id
        // For now, we assume the campaign cell is provided in the transaction
        let _campaign_input_index = tx.as_ref().map(|t| t.raw().inputs().len()).unwrap_or(0);

        // Get the campaign cell (assuming it's passed in the transaction)
        let campaign_result = find_out_point_by_type(current_script.clone());

        match campaign_result {
            Ok(campaign_outpoint) => {
                // Add campaign cell as input
                let campaign_input = CellInput::new_builder()
                    .previous_output(campaign_outpoint.clone())
                    .build();
                cell_input_vec_builder = cell_input_vec_builder.push(campaign_input);

                // Get the current campaign cell output
                let current_campaign_output = find_cell_by_out_point(campaign_outpoint.clone())
                    .map_err(|_| Error::CampaignCellNotFound)?;

                // Load the campaign data separately
                let campaign_data_bytes =
                    ckb_std::high_level::load_cell_data(0, ckb_std::ckb_constants::Source::Input)
                        .map_err(|_| Error::CampaignCellNotFound)?;

                // Parse campaign data
                let campaign_data = CampaignData::from_slice(&campaign_data_bytes)
                    .map_err(|_| Error::InvalidCampaignData)?;

                // Verify campaign is active (status = 4)
                if campaign_data.status() != 4u8.into() {
                    return Err(Error::CampaignNotActive);
                }

                // Verify quest exists in campaign


                // Update campaign statistics
                let current_completions_data = campaign_data.total_completions();
                let current_completions_bytes = current_completions_data.as_slice();
                let current_completions = u32::from_le_bytes([
                    current_completions_bytes[0],
                    current_completions_bytes[1],
                    current_completions_bytes[2],
                    current_completions_bytes[3],
                ]);
                let new_completions = current_completions + 1;

                // Create updated campaign data with incremented completion count
                let updated_campaign_data = CampaignData::new_builder()
                    .metadata(campaign_data.metadata())
                    .quests(campaign_data.quests())
                    .total_completions(
                        ckboost_shared::generated::ckboost::Uint32::from_slice(
                            &new_completions.to_le_bytes(),
                        )
                        .unwrap(),
                    )
                    .status(campaign_data.status())
                    .build();

                // Create output campaign cell with updated data
                let campaign_output_index =
                    tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0);
                let updated_campaign_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(current_script))
                            .build(),
                    )
                    .lock(current_campaign_output.lock())
                    .capacity(current_campaign_output.capacity())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(updated_campaign_output);

                // Serialize and add updated campaign data
                let updated_campaign_data_bytes = updated_campaign_data.as_bytes();
                outputs_data_builder =
                    outputs_data_builder.push(updated_campaign_data_bytes.pack());

                // Create the recipe witness
                // Store quest data in outputs_data temporarily (this is a simplification)
                let quest_data_index = tx
                    .as_ref()
                    .map(|t| t.raw().outputs_data().len())
                    .unwrap_or(0) as u32
                    + 1;

                let recipe = create_recipe_with_args(
                    "CKBoostCampaign.approve_completion",
                    vec![
                        create_recipe_with_reference(Source::Output, quest_data_index),
                        create_recipe_with_reference(Source::Output, quest_data_index + 1),
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
                        let total_inputs = cell_input_vec_builder.build().len();

                        // Copy existing witnesses or create empty ones up to campaign_output_index
                        for i in 0..campaign_output_index {
                            if let Some(witness) = witnesses.get(i) {
                                builder = builder.push(witness);
                            } else {
                                let empty_witness = WitnessArgsBuilder::default().build();
                                builder = builder.push(empty_witness.as_bytes().pack());
                            }
                        }

                        // Add the recipe witness at campaign_output_index
                        builder = builder.push(witness_args.as_bytes().pack());

                        // Add remaining witnesses
                        for i in (campaign_output_index + 1)..total_inputs {
                            if let Some(witness) = witnesses.get(i) {
                                builder = builder.push(witness);
                            } else {
                                let empty_witness = WitnessArgsBuilder::default().build();
                                builder = builder.push(empty_witness.as_bytes().pack());
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
            Err(_) => {
                debug!("Campaign cell not found");
                Err(Error::CampaignCellNotFound)
            }
        }
    }

    fn verify_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug!("Starting verify_approve_completion");

        // Use the recipe validation rules
        let validation_rules = recipes::complete_quest::get_rules();
        validation_rules.validate(&context)?;

        debug!("Quest completion transaction validation completed successfully");
        Ok(())
    }
}
