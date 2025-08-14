#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use ckb_std::high_level::load_script;
use ckboost_shared::type_id::validate_type_id;
use ckboost_shared::types::ConnectedTypeID;
use ckboost_shared::Error;
use ckb_ssri_std::utils::should_fallback;
use ckb_ssri_std_proc_macro::ssri_methods;
use ckb_std::debug;
use ckb_std::syscalls::{pipe, write};
use molecule::prelude::Entity;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

pub mod modules;
pub mod ssri;
pub mod fallback;
pub mod recipes;

use crate::{fallback::fallback, ssri::CKBoostUser};

fn program_entry_wrap() -> Result<(), Error> {
    let argv = ckb_std::env::argv();

    if should_fallback()? {
                // # Validation Rules
        // 
        // 1. **Type ID mechanism**: Ensures the campaign cell uses the correct type ID
        let args = load_script()?.args();
        debug!("args: {:?}", args);
        let connected_type_id = ConnectedTypeID::from_slice(&args.raw_data()).map_err(|_| Error::InvalidConnectedTypeId)?;
        debug!("connected_type_id: {:?}", connected_type_id);
        match validate_type_id(connected_type_id.type_id().into()) {
            Ok(_) => fallback()?,
            Err(err) => {
                debug!("Contract execution failed with error: {:?}", err);
                return Err(err);
            }
        }
        return Ok(());
    }

    debug!("Entering SSRI methods for CKBoost User");
    
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        "CKBoostUser.submit_quest" => {
            debug!("Entered CKBoostUser.submit_quest");
            
            // Parse optional transaction (argv[1])
            let tx: Option<ckb_std::ckb_types::packed::Transaction> = if argv[1].is_empty() || argv[1].as_ref().to_str().map_err(|_| Error::Utf8Error)? == "" {
                None
            } else {
                let parsed_tx = ckb_std::ckb_types::packed::Transaction::from_compatible_slice(&ckb_std::high_level::decode_hex(argv[1].as_ref())?)
                    .map_err(|_| Error::InvalidBaseTransactionForSSRI)?;
                Some(parsed_tx)
            };
            
            // Parse user_data from molecule serialized bytes (argv[2])
            let user_data_bytes = ckb_std::high_level::decode_hex(argv[2].as_ref())?;
            let user_data = ckboost_shared::types::UserData::from_slice(&user_data_bytes)
                .map_err(|_| Error::InvalidCampaignData)?;
            
            // Call the submit_quest method and return the transaction
            let result_tx = crate::modules::CKBoostUserType::submit_quest(tx, user_data)?;
            Ok(Cow::from(result_tx.as_bytes().to_vec()))
        },
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