#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use ckb_std::high_level::load_script;
use ckboost_shared::type_id::validate_type_id;
use ckboost_shared::types::ConnectedTypeID;
use ckboost_shared::{type_id::check_type_id_from_script_args, Error};
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

use crate::fallback::fallback;

fn program_entry_wrap() -> Result<(), Error> {
    let argv = ckb_std::env::argv();

    if should_fallback()? {
        // # Validation Rules
        // 
        // 1. **Type ID mechanism**: Ensures the campaign cell uses the correct type ID
        let args = load_script()?.args();
        let connected_type_id = ConnectedTypeID::from_slice(&args.as_slice()).map_err(|_| Error::MoleculeVerificationError)?;
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
        
        // TODO: Implement SSRI methods for campaign operations
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