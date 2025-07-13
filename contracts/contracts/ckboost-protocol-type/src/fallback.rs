use ckboost_shared::Error;
use alloc::vec;
use alloc::vec::Vec;
use ckb_std::{
    ckb_constants::Source, debug, high_level::load_cell_lock_hash
};

use ckb_ssri_std::public_module_traits::udt::{UDTPausable, UDT};

pub fn fallback() -> Result<(), Error> {
    debug!("Entered fallback");
    Ok(())
}