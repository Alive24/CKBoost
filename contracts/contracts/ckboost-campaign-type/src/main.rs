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

#[cfg(not(feature = "library"))]
pub mod ssri;
#[cfg(not(feature = "library"))]
pub mod modules;
#[cfg(not(feature = "library"))]
pub mod recipes;
#[cfg(not(feature = "library"))]
pub mod fallback;

use crate::{fallback::fallback, ssri::CKBoostCampaign};

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

    debug!("Entering SSRI methods for CKBoost Campaign");
    
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        "CKBoostCampaign.update_campaign" => {
            debug!("Entered CKBoostCampaign.update_campaign");
            
            // Parse optional transaction (argv[1])
            let tx: Option<ckb_std::ckb_types::packed::Transaction> = if argv[1].is_empty() || argv[1].as_ref().to_str().map_err(|_| Error::Utf8Error)? == "" {
                None
            } else {
                let parsed_tx = ckb_std::ckb_types::packed::Transaction::from_compatible_slice(&ckb_std::high_level::decode_hex(argv[1].as_ref())?)
                    .map_err(|_| Error::InvalidBaseTransactionForSSRI)?;
                Some(parsed_tx)
            };
            
            // Parse campaign_data from molecule serialized bytes (argv[2])
            let campaign_data_bytes = ckb_std::high_level::decode_hex(argv[2].as_ref())?;
            let campaign_data = ckboost_shared::types::CampaignData::from_slice(&campaign_data_bytes)
                .map_err(|_| Error::InvalidCampaignData)?;
            
            // Call the update_campaign method and return the transaction
            let result_tx = crate::modules::CKBoostCampaignType::update_campaign(tx, campaign_data)?;
            Ok(Cow::from(result_tx.as_bytes().to_vec()))
        },
        // "CKBoostCampaign.approve_completion" => {
        //     // debug!("Entered CKBoostCampaign.approve_completion");
            
        //     // // Parse optional transaction (argv[1])
        //     // let tx: Option<ckb_std::ckb_types::packed::Transaction> = if argv[1].is_empty() || argv[1].as_ref().to_str().map_err(|_| Error::Utf8Error)? == "" {
        //     //     None
        //     // } else {
        //     //     let parsed_tx = ckb_std::ckb_types::packed::Transaction::from_compatible_slice(&ckb_std::high_level::decode_hex(argv[1].as_ref())?)
        //     //         .map_err(|_| Error::MoleculeVerificationError)?;
        //     //     Some(parsed_tx)
        //     // };
            
        //     // // Parse campaign_id (argv[2])
        //     // let campaign_id_bytes = ckb_std::high_level::decode_hex(argv[2].as_ref())?;
        //     // if campaign_id_bytes.len() != 32 {
        //     //     return Err(Error::SSRIMethodsArgsInvalid);
        //     // }
        //     // let campaign_id = ckboost_shared::types::Byte32::from_slice(&campaign_id_bytes)
        //     //     .map_err(|_| Error::MoleculeVerificationError)?;
            
        //     // // Parse quest_data from molecule serialized bytes (argv[3])
        //     // let quest_data_bytes = ckb_std::high_level::decode_hex(argv[3].as_ref())?;
        //     // let quest_data = ckboost_shared::types::QuestData::from_slice(&quest_data_bytes)
        //     //     .map_err(|_| Error::MoleculeVerificationError)?;
            
        //     // // Call the approve_completion method and return the transaction
        //     // let result_tx = crate::modules::CKBoostCampaignType::approve_completion(tx, campaign_id, quest_data)?;
        //     // Ok(Cow::from(result_tx.as_bytes().to_vec()))
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