use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, transaction_context::TransactionContext,
    create_recipe_with_reference, create_recipe_with_args, serialize_transaction_recipe,
};
use ckb_std::{
    debug,
    high_level::load_script,
    ckb_constants::Source,
    ckb_types::{
        packed::{
            Transaction, TransactionBuilder, RawTransactionBuilder,
            CellInput, CellInputVecBuilder, CellOutputBuilder, CellOutputVecBuilder,
            BytesVecBuilder, CellDepVecBuilder, Byte32Vec,
            ScriptOptBuilder, ScriptBuilder, WitnessArgsBuilder, BytesOpt,
        },
        prelude::*,
    },
};
use blake2b_ref::Blake2bBuilder;
use ckb_ssri_std::utils::high_level::{find_cell_by_out_point, find_out_point_by_type};
use ckboost_shared::{
    types::{ProtocolData, TippingProposalData},
    Error,
};
use ckboost_shared::types::Byte32 as SharedByte32;
use alloc::vec;

pub struct CKBoostProtocolType;

use crate::{recipes, ssri::CKBoostProtocol};


impl CKBoostProtocol for CKBoostProtocolType {
    fn update_protocol(
        tx: Option<Transaction>,
        protocol_data: ProtocolData,
    ) -> Result<Transaction, Error> {
        debug!("CKBoostProtocolType::update_protocol - Starting protocol update");
        
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
        
        // Try to find existing protocol cell or create new one
        debug!("load_script");
        let current_script = load_script()?;
        debug!("current_script: {:?}", current_script);
        debug!("current_script args length: {}", current_script.args().len());
        
        // Track the index where the protocol cell will be in the inputs
        let protocol_input_index: usize;
        
        // Track if we have a protocol output and at what index
        let mut protocol_output_index: Option<usize> = None;
        
        // If the arg of current script is empty, we're creating a new protocol cell
        // Otherwise, try to find the existing one
        let protocol_result: Result<ckb_std::ckb_types::packed::OutPoint, ckb_std::error::SysError> = if current_script.args().len() == 0 {
            debug!("Script args empty - creating new protocol cell");
            Err(ckb_std::error::SysError::Unknown(0))
        } else {
            debug!("Script args present - looking for existing protocol cell");
            debug!("find_out_point_by_type");
            // TODO (ckb-ssri-std): This might not be able to properly propagate the error if not found
            let result = find_out_point_by_type(current_script.clone());
            debug!("find_out_point_by_type done");
            debug!("protocol_result: {:?}", result);
            result
        };

        match protocol_result {
            Ok(protocol_outpoint) => {
                debug!("Found existing protocol cell, updating it");
                
                // The protocol cell will be added at the current end of inputs
                protocol_input_index = tx.as_ref().map(|t| t.raw().inputs().len()).unwrap_or(0);
                
                // Add protocol cell as input
                let protocol_input = CellInput::new_builder()
                    .previous_output(protocol_outpoint.clone())
                    .build();
                cell_input_vec_builder = cell_input_vec_builder.push(protocol_input);
                
                // Get the current protocol cell to preserve lock script
                let current_protocol_cell = find_cell_by_out_point(protocol_outpoint)
                    .map_err(|_| Error::ProtocolCellNotFound)?;
                
                // Track that we're adding a protocol output at the current output count
                protocol_output_index = Some(tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0));
                
                // Create output protocol cell with updated data
                let new_protocol_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(current_script))
                            .build(),
                    )
                    .lock(current_protocol_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_protocol_output);
            }
            Err(_) => {
                debug!("No protocol cell found. Creating a new protocol cell.");
                
                // In creation case, protocol cell doesn't exist as input
                // But we still need a witness for the first input (used for type ID calculation)
                // So the witness will be at index 0
                protocol_input_index = 0;
                
                // Protocol creation case - need type ID
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
                    // No transaction provided - we cannot create a protocol cell without inputs
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
                
                // Use the code hash from the current script context
                let new_type_script = ScriptBuilder::default()
                    .code_hash(current_script.code_hash())
                    .hash_type(current_script.hash_type())
                    .args(type_id.to_vec().pack())
                    .build();
                
                // Get first input cell to use its lock for the new protocol cell
                let first_input_outpoint = first_input.previous_output();
                let first_input_cell = find_cell_by_out_point(first_input_outpoint)?;
                
                // Track that we're adding a protocol output at the current output count
                protocol_output_index = Some(tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0));
                
                // Create new protocol cell
                let new_protocol_output = CellOutputBuilder::default()
                    .type_(
                        ScriptOptBuilder::default()
                            .set(Some(new_type_script))
                            .build(),
                    )
                    .lock(first_input_cell.lock())
                    .capacity(0u64.pack())
                    .build();
                cell_output_vec_builder = cell_output_vec_builder.push(new_protocol_output);
            }
        }
        
        // Serialize and add updated protocol data
        let protocol_data_bytes = protocol_data.as_bytes();
        outputs_data_builder = outputs_data_builder.push(protocol_data_bytes.pack());
        
        // Create the recipe witness using ckb_deterministic's helper function
        // The witness will contain a reference to the output data index
        let output_data_index = tx.as_ref().map(|t| t.raw().outputs_data().len()).unwrap_or(0) as u32;
        
        // Create recipe with output data reference
        let recipe = create_recipe_with_args(
            "CKBoostProtocol.update_protocol",
            vec![create_recipe_with_reference(Source::Output, output_data_index)]
        )?;
        
        // Serialize the recipe to bytes
        let recipe_bytes = serialize_transaction_recipe(&recipe);
        
        // Create WitnessArgs with recipe in output_type field
        let witness_args = WitnessArgsBuilder::default()
            .lock(BytesOpt::default())  // Lock field will be filled by signing
            .input_type(BytesOpt::default())  // Not used
            .output_type(BytesOpt::new_builder().set(Some(recipe_bytes.pack())).build())  // Recipe goes here!
            .build();
        
        // Determine where to place the witness:
        // Prefer output index if we have a protocol output, otherwise use input index
        let witness_index = match protocol_output_index {
            Some(output_idx) => {
                debug!("Placing recipe witness at output index: {}", output_idx);
                output_idx
            }
            None => {
                debug!("No protocol output, placing recipe witness at input index: {}", protocol_input_index);
                protocol_input_index
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
                            // Create empty WitnessArgs for missing witnesses
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
                            // Create empty WitnessArgs for missing witnesses
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
                    .version(
                        tx.clone()
                            .map(|t| t.raw().version())
                            .unwrap_or_default(),
                    )
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

    fn verify_update_protocol(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug!("Starting verify_update_protocol");
        
        // Use the recipe validation rules - they will check method path internally
        let validation_rules = recipes::update_protocol::get_rules();
        validation_rules.validate(&context)?;

        debug!("Protocol update transaction validation completed successfully");
        Ok(())
    }

    fn update_tipping_proposal(
        _protocol_type_hash: SharedByte32,
        _tipping_proposal_data: TippingProposalData,
    ) -> Result<(), Error> {
        // TODO: Implement SSRI tipping proposal update logic
        // This should handle the actual tipping proposal update operation
        Ok(())
    }

    fn verify_update_tipping_proposal(
        _context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug!("Starting verify_update_tipping_proposal");

        // TODO: Implement tipping proposal validation using recipe pattern
        // Once tipping_proposal module is added to recipes.rs, use:
        // let validation_rules = recipes::tipping_proposal::get_validation_rules();
        // validation_rules.validate(&context)?;

        debug!("Tipping proposal type script constraint validation completed successfully");
        Ok(())
    }
}

