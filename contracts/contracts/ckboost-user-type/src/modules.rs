use alloc::vec;
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
            ScriptOptBuilder, Transaction, TransactionBuilder, WitnessArgsBuilder,
        },
        prelude::*,
    },
    debug,
    high_level::load_script,
};
use ckboost_shared::{
    types::{ConnectedTypeID, UserData, UserVerificationData},
    Error,
};

pub struct CKBoostUserType;

use crate::{recipes, ssri::CKBoostUser};

impl CKBoostUser for CKBoostUserType {
    fn update_user_verification(
        _user_verification_data: UserVerificationData,
    ) -> Result<(), Error> {
        debug!("CKBoostUserType::update_user_verification - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_update_user_verification() -> Result<(), Error> {
        debug!("CKBoostUserType::verify_update_user_verification - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn submit_quest(
        tx: Option<Transaction>,
        user_data: UserData,
    ) -> Result<Transaction, Error> {
        debug!("CKBoostUserType::submit_quest - Starting quest submission");

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
        let connected_type_id = ConnectedTypeID::from_slice(&args.raw_data())
            .map_err(|_| Error::InvalidConnectedTypeId)?;
        
        debug!("connected_type_id: {:?}", connected_type_id);

        // Find existing user cell with this type ID
        let user_outpoint = find_out_point_by_type(current_script.clone())?;

        // The user cell will be added at the current end of inputs
        let _user_input_index = tx.as_ref().map(|t| t.raw().inputs().len()).unwrap_or(0);

        // Add user cell as input
        let user_input = CellInput::new_builder()
            .previous_output(user_outpoint.clone())
            .build();
        cell_input_vec_builder = cell_input_vec_builder.push(user_input);

        // Get the current user cell to preserve lock script
        let current_user_cell = find_cell_by_out_point(user_outpoint)
            .map_err(|_| Error::UserCellNotFound)?;

        // Track that we're adding a user output at the current output count
        let user_output_index = tx.as_ref().map(|t| t.raw().outputs().len()).unwrap_or(0);

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
        debug!("Starting verify_submit_quest");

        // Use the recipe validation rules
        let validation_rules = recipes::submit_quest::get_rules();
        validation_rules.validate(&context)?;

        debug!("Quest submission transaction validation completed successfully");
        Ok(())
    }
    
    fn update_user(
        _tx: Option<Transaction>,
        _user_data: UserData,
    ) -> Result<Transaction, Error> {
        debug!("CKBoostUserType::update_user - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_update_user(
        _context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug!("CKBoostUserType::verify_update_user - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
}