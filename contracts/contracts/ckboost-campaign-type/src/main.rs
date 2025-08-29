#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use ckb_deterministic::{debug_info, debug_trace};
use ckb_std::{ckb_types::packed::Byte32Vec, high_level::load_script};
use ckboost_shared::type_id::validate_type_id;
use ckboost_shared::types::ConnectedTypeID;
use ckboost_shared::Error;
use ckb_ssri_std::utils::should_fallback;
use ckb_ssri_std_proc_macro::ssri_methods;
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
        debug_trace!("Should fallback!");
        // # Validation Rules
        // 
        // 1. **Type ID mechanism**: Ensures the campaign cell uses the correct type ID
        debug_trace!("Loading script for validation");
        let script = load_script()?;
        debug_trace!("Script loaded successfully");
        
        let args = script.args();
        let args_raw = args.raw_data();
        debug_info!("Script args length: {} bytes", args_raw.len());
        debug_info!("Script args hex: {:02x?}", &args_raw[..core::cmp::min(64, args_raw.len())]);
        
        // ConnectedTypeID should be exactly 64 bytes (32 bytes type_id + 32 bytes connected_key)
        if args_raw.len() != 76 {
            debug_info!("ERROR: Invalid args length for ConnectedTypeID. Expected 76, got {}", args_raw.len());
            return Err(Error::InvalidConnectedTypeId);
        }
        
        debug_trace!("Parsing ConnectedTypeID from args");
        let connected_type_id = match ConnectedTypeID::from_slice(&args_raw) {
            Ok(id) => {
                debug_trace!("Successfully parsed ConnectedTypeID");
                id
            },
            Err(e) => {
                debug_info!("ERROR: Failed to parse ConnectedTypeID: {:?}", e);
                return Err(Error::InvalidConnectedTypeId);
            }
        };
        
        debug_info!("Validating type_id");
        match validate_type_id(connected_type_id.type_id().into()) {
            Ok(_) => {
                debug_trace!("Type ID validation passed, calling fallback");
                fallback()?
            },
            Err(err) => {
                debug_trace!("Type ID validation failed with error: {:?}", err);
                return Err(err);
            }
        }
        return Ok(());
    }

    debug_trace!("Entering SSRI methods for CKBoost Campaign");
    
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        "CKBoostCampaign.update_campaign" => {
            debug_trace!("Entered CKBoostCampaign.update_campaign");
            
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
        "CKBoostCampaign.approve_completion" => {
            debug_trace!("Entered CKBoostCampaign.approve_completion");
            
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
            
            // Parse quest_id from argv[3] (u32)
            let quest_id_bytes = ckb_std::high_level::decode_hex(argv[3].as_ref())?;
            if quest_id_bytes.len() != 4 {
                return Err(Error::SSRIMethodsArgsInvalid);
            }
            let quest_id = u32::from_le_bytes([quest_id_bytes[0], quest_id_bytes[1], quest_id_bytes[2], quest_id_bytes[3]]);
            
            // Parse user_type_ids from argv[4]
            let user_type_ids_bytes = ckb_std::high_level::decode_hex(argv[4].as_ref())?;
            
            let user_type_ids = Byte32Vec::from_slice(&user_type_ids_bytes)
                .map_err(|e| {
                    debug_trace!("Failed to parse user_type_ids from molecule serialized bytes: {:?}", e);
                    Error::InvalidArgument
                })?;
            
            // Call the approve_completion method and return the transaction
            let result_tx = crate::modules::CKBoostCampaignType::approve_completion(tx, campaign_data, quest_id, user_type_ids)?;
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
            debug_trace!("Contract execution failed with error: {:?}", err);
            err as i8
        }
    }
}