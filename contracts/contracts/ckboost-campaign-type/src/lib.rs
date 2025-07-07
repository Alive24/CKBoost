#![no_std]
#![cfg_attr(not(test), no_main)]

pub mod generated;
pub mod error;
pub mod campaign_logic;
pub mod ssri;
pub mod modules;

#[cfg(test)]
pub mod tests;

#[cfg(test)]
extern crate alloc;

#[cfg(not(test))]
use ckb_std::default_alloc;

#[cfg(not(test))]
ckb_std::entry!(program_entry);
#[cfg(not(test))]
default_alloc!();

pub fn program_entry() -> i8 {
    match campaign_logic::main() {
        Ok(_) => 0,
        Err(err) => {
            ckb_std::debug!("Campaign type script error: {:?}", err);
            err as i8
        }
    }
}
