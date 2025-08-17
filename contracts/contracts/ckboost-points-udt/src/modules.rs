use ckboost_shared::Error;
use alloc::vec::Vec;
use ckb_ssri_std::public_module_traits::udt::UDT;
use ckb_std::ckb_types::packed::{
    CellOutputBuilder, CellOutputVecBuilder, Script, ScriptOptBuilder, 
    Transaction, TransactionBuilder, Uint64, BytesVecBuilder
};
use ckb_std::ckb_types::{bytes::Bytes, prelude::*};
use ckb_std::debug;
use ckb_std::high_level::load_script;

pub struct PointsUDT;

impl UDT for PointsUDT {
    type Error = Error;

    /// Get the name of the Points token
    fn name() -> Result<Bytes, Error> {
        Ok(Bytes::from("CKBoost Protocol Points".as_bytes()))
    }

    /// Get the symbol of the Points token
    fn symbol() -> Result<Bytes, Error> {
        Ok(Bytes::from("POINTS".as_bytes()))
    }

    /// Get the decimals of the Points token
    fn decimals() -> Result<u8, Error> {
        Ok(8) // Standard 8 decimals for UDT
    }

    /// Get the icon/logo of the Points token
    fn icon() -> Result<Bytes, Error> {
        Ok(Bytes::from("🏆".as_bytes()))
    }

    /// Transfer Points tokens from sender to recipients
    /// This follows standard UDT transfer rules with balance validation
    fn transfer(
        tx: Option<Transaction>,
        to_lock_vec: Vec<Script>,
        to_amount_vec: Vec<u128>,
    ) -> Result<Transaction, Error> {
        debug!("PointsUDT::transfer called");
        
        if to_amount_vec.len() != to_lock_vec.len() {
            return Err(Error::InvalidArgument);
        }

        // Build transaction
        let tx_builder = match tx {
            Some(ref tx) => tx.clone().as_builder(),
            None => TransactionBuilder::default(),
        };

        let raw_tx_builder = match tx {
            Some(ref tx) => tx.clone().raw().as_builder(),
            None => ckb_std::ckb_types::packed::RawTransactionBuilder::default(),
        };

        // Add outputs for recipients
        let mut cell_output_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs().as_builder(),
            None => CellOutputVecBuilder::default(),
        };

        // Get current UDT script
        let udt_script = load_script()?;

        for to_lock in to_lock_vec.iter() {
            let new_transfer_output = CellOutputBuilder::default()
                .type_(
                    ScriptOptBuilder::default()
                        .set(Some(udt_script.clone()))
                        .build(),
                )
                .capacity(Uint64::default())
                .lock(to_lock.clone())
                .build();
            cell_output_vec_builder = cell_output_vec_builder.push(new_transfer_output);
        }

        // Add output data (amounts)
        let mut outputs_data_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs_data().as_builder(),
            None => BytesVecBuilder::default(),
        };

        for to_amount in to_amount_vec.iter() {
            outputs_data_builder = outputs_data_builder.push(to_amount.pack().as_bytes().pack());
        }

        // Build final transaction
        let raw_tx = raw_tx_builder
            .outputs(cell_output_vec_builder.build())
            .outputs_data(outputs_data_builder.build())
            .build();

        let final_tx = tx_builder
            .raw(raw_tx)
            .build();

        Ok(final_tx)
    }

    /// Mint new Points tokens
    /// This requires protocol owner mode validation (campaign cell + admin signature)
    fn mint(
        tx: Option<Transaction>,
        to_lock_vec: Vec<Script>,
        to_amount_vec: Vec<u128>,
    ) -> Result<Transaction, Error> {
        debug!("PointsUDT::mint called");
        
        if to_amount_vec.len() != to_lock_vec.len() {
            return Err(Error::InvalidArgument);
        }

        // Note: The actual validation happens in the type script's entry point
        // This method just builds the transaction with the new minted tokens
        
        // Build transaction similar to transfer
        let tx_builder = match tx {
            Some(ref tx) => tx.clone().as_builder(),
            None => TransactionBuilder::default(),
        };

        let raw_tx_builder = match tx {
            Some(ref tx) => tx.clone().raw().as_builder(),
            None => ckb_std::ckb_types::packed::RawTransactionBuilder::default(),
        };

        // Add outputs for minted tokens
        let mut cell_output_vec_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs().as_builder(),
            None => CellOutputVecBuilder::default(),
        };

        // Get current UDT script
        let udt_script = load_script()?;

        for to_lock in to_lock_vec.iter() {
            let new_mint_output = CellOutputBuilder::default()
                .type_(
                    ScriptOptBuilder::default()
                        .set(Some(udt_script.clone()))
                        .build(),
                )
                .capacity(Uint64::default())
                .lock(to_lock.clone())
                .build();
            cell_output_vec_builder = cell_output_vec_builder.push(new_mint_output);
        }

        // Add output data (amounts)
        let mut outputs_data_builder = match tx {
            Some(ref tx) => tx.clone().raw().outputs_data().as_builder(),
            None => BytesVecBuilder::default(),
        };

        for to_amount in to_amount_vec.iter() {
            outputs_data_builder = outputs_data_builder.push(to_amount.pack().as_bytes().pack());
        }

        // Build final transaction
        let raw_tx = raw_tx_builder
            .outputs(cell_output_vec_builder.build())
            .outputs_data(outputs_data_builder.build())
            .build();

        let final_tx = tx_builder
            .raw(raw_tx)
            .build();

        Ok(final_tx)
    }

    /// Verify transfer operation
    fn verify_transfer() -> Result<(), Error> {
        debug!("PointsUDT::verify_transfer called");
        
        // Standard UDT validation for transfers
        // This is called from the type script fallback
        crate::utils::validate_udt_rules()?;
        
        Ok(())
    }

    /// Verify mint operation
    fn verify_mint() -> Result<(), Error> {
        debug!("PointsUDT::verify_mint called");
        
        // Get protocol type hash from script args
        let script = load_script()?;
        let args: Bytes = script.args().unpack();
        
        if args.len() != 32 {
            return Err(Error::InvalidArgument);
        }
        
        let protocol_type_hash = args.as_ref();
        
        // Validate protocol owner mode for minting
        crate::utils::validate_protocol_owner_mode(protocol_type_hash)?;
        
        Ok(())
    }
}