#![no_std]
#![cfg_attr(not(test), no_main)]

extern crate alloc;

pub mod cell_collector;
pub mod campaign_authorization;
pub mod error;
pub mod generated;
pub mod known_script;
pub mod protocol_data;
pub mod ssri;
pub mod transaction_context;
pub mod type_id;
pub mod types;

// Re-export error types at crate root
pub use error::*;

// Re-export validation in ckb_deterministic
pub use ckb_deterministic::validation;

// Re-export extension trait for protocol data
pub use protocol_data::ProtocolDataExt;
