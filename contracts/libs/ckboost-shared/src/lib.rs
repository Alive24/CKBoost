#![no_std]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

pub mod generated;
pub mod error;
pub mod types;
pub mod type_id;
pub mod ssri;
pub mod cell_collector;
pub mod protocol_data;
pub mod transaction_context;

// Re-export error types at crate root
pub use error::*;

// Re-export validation in ckb_deterministic
pub use ckb_deterministic::validation;

// Re-export extension trait for protocol data
pub use protocol_data::ProtocolDataExt;
