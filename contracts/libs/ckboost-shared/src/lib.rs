#![no_std]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

pub mod generated;
pub mod error;
pub mod types;
pub mod type_id;
pub mod transaction_recipe;
pub mod ssri;
pub mod cell_collector;
pub mod transaction_context;
pub mod protocol_data;
pub mod fallback;

// Re-export error types at crate root
pub use error::*;
