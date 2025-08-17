#![cfg_attr(not(any(feature = "library", test)), no_std)]
#![cfg_attr(not(test), no_main)]

#[cfg(any(feature = "library", test))]
extern crate alloc;

use alloc::borrow::Cow;
use alloc::vec;
use ckb_ssri_std::utils::should_fallback;
use ckb_ssri_std_proc_macro::ssri_methods;
use ckb_std::ckb_types::packed::Transaction;
use ckb_std::ckb_types::prelude::*;
use ckb_std::debug;
use ckb_std::syscalls::{pipe, write};
use ckboost_shared::Error;

#[cfg(not(any(feature = "library", test)))]
ckb_std::entry!(program_entry);
#[cfg(not(any(feature = "library", test)))]
ckb_std::default_alloc!(16384, 1258306, 64);

use ckb_ssri_std::public_module_traits::udt::UDT;

mod fallback;
mod modules;
mod utils;

fn program_entry_wrap() -> Result<(), Error> {
    let argv = ckb_std::env::argv();

    // Check if we should use fallback validation (non-SSRI mode)
    if should_fallback()? {
        return Ok(fallback::fallback()?);
    }

    debug!("Entering SSRI methods for Points UDT");
    
    // SSRI method dispatcher
    let res: Cow<'static, [u8]> = ssri_methods!(
        argv: &argv,
        invalid_method: Error::SSRIMethodsNotFound,
        invalid_args: Error::SSRIMethodsArgsInvalid,
        
        // UDT metadata methods
        "UDT.name" => Ok(Cow::from(modules::PointsUDT::name()?.to_vec())),
        "UDT.symbol" => Ok(Cow::from(modules::PointsUDT::symbol()?.to_vec())),
        "UDT.decimals" => Ok(Cow::from(modules::PointsUDT::decimals()?.to_le_bytes().to_vec())),
        "UDT.icon" => Ok(Cow::from(modules::PointsUDT::icon()?.to_vec())),
        
        // UDT transfer method
        "UDT.transfer" => {
            debug!("Processing UDT.transfer");
            
            // For now, just return an error since we're not fully implementing the SSRI parsing
            // This would need proper Molecule parsing in production
            Err(Error::SSRIMethodsNotImplemented)?
        },
        
        // UDT mint method
        "UDT.mint" => {
            debug!("Processing UDT.mint");
            
            // For now, just return an error since we're not fully implementing the SSRI parsing
            // This would need proper Molecule parsing in production
            Err(Error::SSRIMethodsNotImplemented)?
        },
    )?;
    
    // Write response to pipe
    let pipe = pipe()?;
    write(pipe.1, &res)?;
    Ok(())
}

pub fn program_entry() -> i8 {
    match program_entry_wrap() {
        Ok(_) => 0,
        Err(err) => err as i8,
    }
}