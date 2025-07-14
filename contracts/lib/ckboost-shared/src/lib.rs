#![no_std]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

mod generated;
pub mod error;
pub mod types;
pub mod type_id;
pub mod transaction_recipe;
pub mod ssri;

// Re-export error types at crate root
pub use error::*;
