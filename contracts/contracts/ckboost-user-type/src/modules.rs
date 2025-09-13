use alloc::vec;
use blake2b_ref::Blake2bBuilder;
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, create_recipe_with_args, create_recipe_with_reference, debug_trace, serialize_transaction_recipe, transaction_context::TransactionContext
};
use ckb_ssri_std::utils::high_level::{find_cell_by_out_point, find_cell_data_by_out_point, find_out_point_by_type};
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
    types::{Byte32 as SharedByte32, ConnectedTypeID, UserData, UserVerificationData},
    Error,
};

pub struct CKBoostUserType;

use crate::{recipes, ssri::CKBoostUser};

impl CKBoostUser for CKBoostUserType {
    fn update_verification_data(
        tx: Option<Transaction>,
        user_verification_data: UserVerificationData,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostUserType::update_verification_data - Starting verification data update");

        // This follows the same pattern as submit_quest but only updates verification data
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

        // Get context script and try to parse ConnectedTypeID from args
        let current_script = load_script()?;
        debug_trace!("current_script: {:?}", current_script);

        let args = current_script.args();
        let connected_type_id = ConnectedTypeID::from_slice(&args.raw_data());
        
        match connected_type_id {
            Ok(connected_type_id) => {
                debug_trace!("Updating existing user cell verification data");
                debug_trace!("connected_type_id: {:?}", connected_type_id);

                // Try to find existing user cell with this type ID
                let user_outpoint = match find_out_point_by_type(current_script.clone()) {
                    Ok(outpoint) => outpoint,
                    Err(e) => {
                        debug_trace!("ERROR finding user cell: {:?}", e);
                        return Err(e.into());
                    }
                };

                // Add user cell as input
                let user_input = CellInput::new_builder()
                    .previous_output(user_outpoint.clone())
                    .build();
                cell_input_vec_builder = cell_input_vec_builder.push(user_input);

                // Get the current user cell to preserve lock script and existing data
                let current_user_cell = find_cell_by_out_point(user_outpoint.clone()).map_err(|_| Error::UserCellNotFound)?;
                let current_user_cell_data = find_cell_data_by_out_point(user_outpoint)
                    .map_err(|_| Error::UserCellNotFound)?;

                // Parse existing user data to preserve non-verification fields
                let existing_user_data = UserData::from_slice(current_user_cell_data.as_slice())
                    .map_err(|_| Error::InvalidUserCell)?;

                // Create updated user data with new verification data but preserving other fields
                let updated_user_data = UserData::new_builder()
                    .verification_data(user_verification_data)
                    .total_points_earned(existing_user_data.total_points_earned())
                    .last_activity_timestamp(existing_user_data.last_activity_timestamp())
                    .submission_records(existing_user_data.submission_records())
                    .build();

                // Create output user cell with updated data
                let new_user_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(current_script))
                            .build(),
                    )
                    .lock(current_user_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_user_output);

                // Serialize and add updated user data
                let user_data_bytes = updated_user_data.as_bytes();
                outputs_data_builder = outputs_data_builder.push(user_data_bytes.pack());
            }
            Err(_) => {
                debug_trace!("No existing user cell found for verification update");
                return Err(Error::UserCellNotFound);
            }
        }

        // Create the recipe witness using ckb_deterministic's helper function
        let output_data_index = tx
            .as_ref()
            .map(|t| t.raw().outputs_data().len())
            .unwrap_or(0) as u32;

        // Create recipe with output data reference
        let recipe = create_recipe_with_args(
            "CKBoostUser.update_verification_data",
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

        // Build witnesses vector with recipe witness
        let witnesses_builder = match tx {
            Some(ref tx) => {
                let mut builder = BytesVecBuilder::default();
                let witnesses = tx.witnesses();
                let total_inputs = cell_input_vec_builder.build().len();

                // Copy existing witnesses
                for i in 0..witnesses.len() {
                    builder = builder.push(witnesses.get(i).unwrap());
                }

                // Add the recipe witness
                builder = builder.push(witness_args.as_bytes().pack());

                // Add empty witnesses for any remaining inputs
                for _i in witnesses.len()..total_inputs {
                    let empty_witness = WitnessArgsBuilder::default().build();
                    builder = builder.push(empty_witness.as_bytes().pack());
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

    fn verify_update_verification_data(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("Starting verify_verification_data_update");

        // Use the recipe validation rules
        let validation_rules = recipes::update_verification_data::get_rules();
        validation_rules.validate(&context)?;
        
        debug_trace!("Verification data update validation completed successfully");
        Ok(())
    }
    
    fn submit_quest(
        tx: Option<Transaction>,
        user_data: UserData,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostUserType::submit_quest - Starting quest submission");

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

        // Get context script and try to parse ConnectedTypeID from args
        debug_trace!("About to call load_script()");
        let current_script = match load_script() {
            Ok(script) => {
                debug_trace!("load_script() succeeded");
                script
            },
            Err(e) => {
                debug_trace!("ERROR: load_script() failed with error: {:?}", e);
                return Err(e.into());
            }
        };
        debug_trace!("current_script loaded successfully");

        debug_trace!("Getting script args");
        let args = current_script.args();
        debug_trace!("Args obtained, length: {} bytes", args.len());
        
        debug_trace!("Getting raw args data");
        let args_data = args.raw_data();
        debug_trace!("Raw args data obtained, length: {} bytes", args_data.len());
        
        debug_trace!("Parsing ConnectedTypeID from args data");
        let connected_type_id = match ConnectedTypeID::from_slice(&args_data) {
            Ok(id) => {
                debug_trace!("ConnectedTypeID parsed successfully");
                Ok(id)
            },
            Err(e) => {
                debug_trace!("ERROR: Failed to parse ConnectedTypeID: {:?}", e);
                Err(e)
            }
        };
        debug_trace!("ConnectedTypeID parsing completed");
        
        // Track input index for witness placement
        let user_input_index;
        // Track output index for user cell (if created/updated)
        let user_output_index;
        
        match connected_type_id {
            Ok(connected_type_id) => {
                debug_trace!("Found existing user cell, updating it");
                debug_trace!("connected_type_id: {:?}", connected_type_id);

                // Try to find existing user cell with this type ID
                let user_outpoint = find_out_point_by_type(current_script.clone())?;

                // The user cell will be added at the current end of inputs
                user_input_index = tx.as_ref().map(|t| t.raw().inputs().len()).unwrap_or(0);

                // Add user cell as input
                let user_input = CellInput::new_builder()
                    .previous_output(user_outpoint.clone())
                    .build();
                cell_input_vec_builder = cell_input_vec_builder.push(user_input);

                // Get the current user cell to preserve lock script
                let current_user_cell = find_cell_by_out_point(user_outpoint)
                    .map_err(|_| Error::UserCellNotFound)?;

                // Track that we're adding a user output at the current output count
                user_output_index = tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0);

                // Create output user cell with updated data
                let new_user_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(current_script))
                            .build(),
                    )
                    .lock(current_user_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_user_output);
            }
            Err(_) => {
                debug_trace!("No user cell found. Creating a new user cell.");
                
                // In creation case, user cell doesn't exist as input
                // But we still need a witness for the first input (used for type ID calculation)
                user_input_index = 0;
                
                // User creation case - need type ID
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
                        // No transaction provided - we cannot create a user cell without inputs
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
                
                // Get first input cell to use its lock for the new user cell
                let first_input_outpoint = first_input.previous_output();
                let first_input_cell = find_cell_by_out_point(first_input_outpoint)?;
                
                // Track that we're adding a user output at the current output count
                user_output_index = tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0);
                
                // Create new user cell
                let new_user_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(new_type_script))
                            .build(),
                    )
                    .lock(first_input_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_user_output);
            }
        }

        // Serialize and add updated user data
        let user_data_bytes = user_data.as_bytes();
        outputs_data_builder = outputs_data_builder.push(user_data_bytes.pack());

        // Create the recipe witness using ckb_deterministic's helper function
        let output_data_index = tx
            .as_ref()
            .map(|t| t.raw().outputs_data().len())
            .unwrap_or(0) as u32;

        // Create recipe with output data reference
        let recipe = create_recipe_with_args(
            "CKBoostUser.submit_quest",
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

        // Build witnesses vector with recipe witness at the correct index
        let witnesses_builder = match tx {
            Some(ref tx) => {
                let mut builder = BytesVecBuilder::default();
                let witnesses = tx.witnesses();
                let total_inputs = cell_input_vec_builder.build().len();

                // Copy existing witnesses or create empty ones up to user_output_index
                for i in 0..user_output_index {
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

                // Add the recipe witness at user_output_index
                builder = builder.push(witness_args.as_bytes().pack());

                // Add remaining witnesses
                for i in (user_output_index + 1)..total_inputs {
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

    fn verify_submit_quest(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("Starting verify_submit_quest");

        // Use the recipe validation rules
        let validation_rules = recipes::submit_quest::get_rules();
        validation_rules.validate(&context)?;

        debug_trace!("Quest submission transaction validation completed successfully");
        Ok(())
    }
}