#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use ckboost_shared::{type_id::check_type_id_from_script_args, types::ProtocolData, Error};
use ckb_ssri_std::utils::should_fallback;
use ckb_ssri_std_proc_macro::ssri_methods;
use ckb_std::debug;
use ckb_std::syscalls::{pipe, write};
use ckb_std::ckb_types::packed::Transaction;
use molecule::prelude::*;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
// By default, the following heap configuration is used:
// * 16KB fixed heap
// * 1.2MB(rounded up to be 16-byte aligned) dynamic heap
// * Minimal memory block in dynamic heap is 64 bytes
// For more details, please refer to ckb-std's default_alloc macro
// and the buddy-alloc alloc implementation.
ckb_std::default_alloc!(16384, 1258306, 64);

pub mod modules;
pub mod ssri;
pub mod fallback;
pub mod recipes;



use modules::CKBoostProtocolType;

use crate::ssri::CKBoostProtocol;
use crate::fallback::fallback;

fn program_entry_wrap() -> Result<(), Error> {
    let argv = ckb_std::env::argv();

    if should_fallback()? {
        // # Validation Rules
        // 
        // 1. **Type ID mechanism**: Ensures the protocol cell uses the correct type ID
        //    for singleton pattern enforcement
        match check_type_id_from_script_args() {
            Ok(_) => fallback()?,
            Err(err) => {
                debug!("Contract execution failed with error: {:?}", err);
                return Err(err);
            }
        }
        return Ok(());
    }

    debug!("Entering SSRI methods for CKBoost Protocol");
    
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        "CKBoostProtocol.update_protocol" => {
            debug!("Entered CKBoostProtocol.update_protocol");
            
            // Parse optional transaction (argv[1])
            let tx: Option<Transaction> = if argv[1].is_empty() || argv[1].as_ref().to_str().map_err(|_| Error::Utf8Error)? == "" {
                None
            } else {
                let parsed_tx = Transaction::from_compatible_slice(&ckb_std::high_level::decode_hex(argv[1].as_ref())?)
                    .map_err(|_| Error::MoleculeVerificationError)?;
                Some(parsed_tx)
            };
            
            // Parse protocol_data from molecule serialized bytes (argv[2])
            let protocol_data_bytes = ckb_std::high_level::decode_hex(argv[2].as_ref())?;
            let protocol_data = ProtocolData::from_slice(&protocol_data_bytes)
                .map_err(|_| Error::MoleculeVerificationError)?;
            
            // Call the update_protocol method and return the transaction
            let result_tx = CKBoostProtocolType::update_protocol(tx, protocol_data)?;
            Ok(Cow::from(result_tx.as_bytes().to_vec()))
        },
        // "CKBoostProtocol.update_tipping_proposal" => {
        //     debug!("Entered CKBoostProtocol.update_tipping_proposal");
            
        //     // Parse protocol_id
        //     let protocol_id_bytes = decode_hex(argv[1].as_ref())?;
        //     if protocol_id_bytes.len() != 8 {
        //         return Err(Error::SSRIMethodsArgsInvalid);
        //     }
        //     let protocol_id = u64::from_le_bytes(protocol_id_bytes.try_into().unwrap());
            
        //     // Parse tipping_proposal_data from molecule serialized bytes
        //     let proposal_data_bytes = decode_hex(argv[2].as_ref())?;
        //     let tipping_proposal_data = TippingProposalData::from_slice(&proposal_data_bytes)
        //         .map_err(|_| Error::MoleculeVerificationError)?;
            
        //     CKBoostProtocolType::update_tipping_proposal(protocol_id, tipping_proposal_data)?;
        //     Ok(Cow::from(b"success".to_vec()))
        // },
    )?;
    
    let pipe = pipe()?;
    write(pipe.1, &res)?;
    Ok(())
}

pub fn program_entry() -> i8 {
    match program_entry_wrap() {
        Ok(_) => 0,
        Err(err) => {
            debug!("Contract execution failed with error: {:?}", err);
            err as i8
        }
    }
}