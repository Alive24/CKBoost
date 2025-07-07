#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

// Import the lib module
use ckboost_campaign_type::*;
use ckb_ssri_std::ssri_methods;
use ckb_ssri_std_proc_macro::ssri_methods;
use alloc::borrow::Cow;

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

pub fn program_entry() -> i8 {
    ckb_std::debug!("CKBoost Campaign Type Script started");

    match program_entry_wrap() {
        Ok(_) => {
            ckb_std::debug!("Campaign type script completed successfully");
            0
        }
        Err(err) => {
            ckb_std::debug!("Campaign type script error: {:?}", err);
            err as i8
        }
    }
}

fn program_entry_wrap() -> Result<()> {
    let argv = ckb_std::env::argv();
    
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        // Campaign management methods
        "Campaign.create" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let metadata = parse_bytes_arg(&argv, 1)?;
            let funding_config = parse_bytes_arg(&argv, 2)?;
            let initial_funding = parse_u64_arg(&argv, 3)?;
            
            modules::CAMPAIGN_HANDLER.create_campaign(&campaign_id, &metadata, &funding_config, initial_funding)?;
            Ok(Cow::from(&[] as &[u8]))
        },
        
        "Campaign.add_quest" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let quest_data = parse_bytes_arg(&argv, 1)?;
            
            modules::CAMPAIGN_HANDLER.add_quest(&campaign_id, &quest_data)?;
            Ok(Cow::from(&[] as &[u8]))
        },
        
        "Campaign.complete_quest" => {
            let quest_id = parse_bytes32_arg(&argv, 0)?;
            let proof_data = parse_bytes_arg(&argv, 1)?;
            
            modules::CAMPAIGN_HANDLER.complete_quest(&quest_id, &proof_data)?;
            Ok(Cow::from(&[] as &[u8]))
        },
        
        "Campaign.distribute_rewards" => {
            let quest_id = parse_bytes32_arg(&argv, 0)?;
            let participants = parse_bytes_arg(&argv, 1)?;
            
            modules::CAMPAIGN_HANDLER.distribute_rewards(&quest_id, &participants)?;
            Ok(Cow::from(&[] as &[u8]))
        },
        
        // Query methods
        "Campaign.query" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let result = modules::CAMPAIGN_HANDLER.query_campaign(&campaign_id)?;
            Ok(Cow::from(result))
        },
        
        "Quest.query" => {
            let quest_id = parse_bytes32_arg(&argv, 0)?;
            let result = modules::CAMPAIGN_HANDLER.query_quest(&quest_id)?;
            Ok(Cow::from(result))
        },
        
        // Campaign information methods
        "Campaign.name" => {
            let name = modules::CAMPAIGN_HANDLER.get_campaign_name()?;
            Ok(Cow::from(name.as_bytes()))
        },
        
        "Campaign.symbol" => {
            let symbol = modules::CAMPAIGN_HANDLER.get_campaign_symbol()?;
            Ok(Cow::from(symbol.as_bytes()))
        },
        
        "Campaign.decimals" => {
            let decimals = modules::CAMPAIGN_HANDLER.get_campaign_decimals()?;
            Ok(Cow::from([decimals]))
        },
        
        "Campaign.total_supply" => {
            let supply = modules::CAMPAIGN_HANDLER.get_total_supply()?;
            Ok(Cow::from(supply.to_le_bytes()))
        },
        
        "Campaign.metadata" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let metadata = modules::CAMPAIGN_HANDLER.get_metadata(&campaign_id)?;
            Ok(Cow::from(metadata))
        },
        
        "Campaign.status" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let status = modules::CAMPAIGN_HANDLER.get_status(&campaign_id)?;
            Ok(Cow::from([status]))
        },
        
        "Campaign.funding_info" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let funding_info = modules::CAMPAIGN_HANDLER.get_funding_info(&campaign_id)?;
            Ok(Cow::from(funding_info))
        },
        
        "Campaign.quest_count" => {
            let campaign_id = parse_bytes32_arg(&argv, 0)?;
            let count = modules::CAMPAIGN_HANDLER.get_quest_count(&campaign_id)?;
            Ok(Cow::from(count.to_le_bytes()))
        }
    )?;
    
    // If we reach here, it means SSRI method was called and completed successfully
    // For standard type script validation, we would fall through to the original logic
    if res.is_empty() {
        // Standard type script validation
        campaign_logic::main()
    } else {
        // SSRI method completed
        Ok(())
    }
}

/// Parse a 32-byte argument from argv
fn parse_bytes32_arg(argv: &[alloc::vec::Vec<u8>], index: usize) -> Result<[u8; 32]> {
    if index >= argv.len() {
        return Err(Error::SSRIMethodsArgsInvalid);
    }
    
    let arg = &argv[index];
    if arg.len() != 32 {
        return Err(Error::SSRIMethodsArgsInvalid);
    }
    
    let mut result = [0u8; 32];
    result.copy_from_slice(arg);
    Ok(result)
}

/// Parse a bytes argument from argv
fn parse_bytes_arg(argv: &[alloc::vec::Vec<u8>], index: usize) -> Result<alloc::vec::Vec<u8>> {
    if index >= argv.len() {
        return Err(Error::SSRIMethodsArgsInvalid);
    }
    
    Ok(argv[index].clone())
}

/// Parse a u64 argument from argv
fn parse_u64_arg(argv: &[alloc::vec::Vec<u8>], index: usize) -> Result<u64> {
    if index >= argv.len() {
        return Err(Error::SSRIMethodsArgsInvalid);
    }
    
    let arg = &argv[index];
    if arg.len() != 8 {
        return Err(Error::SSRIMethodsArgsInvalid);
    }
    
    let mut bytes = [0u8; 8];
    bytes.copy_from_slice(arg);
    Ok(u64::from_le_bytes(bytes))
}
