#![no_std]

//! SSRI utilities and constants for the CKBoost campaign type script
//! 
//! This module provides SSRI-related utilities and constants.
//! The main SSRI routing is now handled in main.rs using the standard
//! ssri_methods! macro pattern.

extern crate alloc;

use crate::error::{Error, Result};
use alloc::vec::Vec;

/// SSRI method identifiers for campaign operations
pub const CAMPAIGN_CREATE: &str = "Campaign.create";
pub const CAMPAIGN_ADD_QUEST: &str = "Campaign.add_quest";
pub const CAMPAIGN_COMPLETE_QUEST: &str = "Campaign.complete_quest";
pub const CAMPAIGN_DISTRIBUTE_REWARDS: &str = "Campaign.distribute_rewards";
pub const CAMPAIGN_QUERY: &str = "Campaign.query";
pub const CAMPAIGN_NAME: &str = "Campaign.name";
pub const CAMPAIGN_SYMBOL: &str = "Campaign.symbol";
pub const CAMPAIGN_DECIMALS: &str = "Campaign.decimals";
pub const CAMPAIGN_TOTAL_SUPPLY: &str = "Campaign.total_supply";
pub const CAMPAIGN_METADATA: &str = "Campaign.metadata";
pub const CAMPAIGN_STATUS: &str = "Campaign.status";
pub const CAMPAIGN_FUNDING_INFO: &str = "Campaign.funding_info";
pub const CAMPAIGN_QUEST_COUNT: &str = "Campaign.quest_count";

/// SSRI method identifiers for quest operations
pub const QUEST_QUERY: &str = "Quest.query";

/// Utility function to validate SSRI method names
pub fn is_valid_ssri_method(method: &str) -> bool {
    matches!(method,
        CAMPAIGN_CREATE |
        CAMPAIGN_ADD_QUEST |
        CAMPAIGN_COMPLETE_QUEST |
        CAMPAIGN_DISTRIBUTE_REWARDS |
        CAMPAIGN_QUERY |
        CAMPAIGN_NAME |
        CAMPAIGN_SYMBOL |
        CAMPAIGN_DECIMALS |
        CAMPAIGN_TOTAL_SUPPLY |
        CAMPAIGN_METADATA |
        CAMPAIGN_STATUS |
        CAMPAIGN_FUNDING_INFO |
        CAMPAIGN_QUEST_COUNT |
        QUEST_QUERY
    )
}

/// Utility function to check if a method is read-only
pub fn is_readonly_method(method: &str) -> bool {
    matches!(method,
        CAMPAIGN_QUERY |
        CAMPAIGN_NAME |
        CAMPAIGN_SYMBOL |
        CAMPAIGN_DECIMALS |
        CAMPAIGN_TOTAL_SUPPLY |
        CAMPAIGN_METADATA |
        CAMPAIGN_STATUS |
        CAMPAIGN_FUNDING_INFO |
        CAMPAIGN_QUEST_COUNT |
        QUEST_QUERY
    )
}

/// Utility function to check if a method requires campaign ID argument
pub fn requires_campaign_id(method: &str) -> bool {
    matches!(method,
        CAMPAIGN_ADD_QUEST |
        CAMPAIGN_QUERY |
        CAMPAIGN_METADATA |
        CAMPAIGN_STATUS |
        CAMPAIGN_FUNDING_INFO |
        CAMPAIGN_QUEST_COUNT
    )
}

/// Utility function to check if a method requires quest ID argument
pub fn requires_quest_id(method: &str) -> bool {
    matches!(method,
        CAMPAIGN_COMPLETE_QUEST |
        CAMPAIGN_DISTRIBUTE_REWARDS |
        QUEST_QUERY
    )
}

/// SSRI response serialization utilities
pub mod serialization {
    use super::*;
    
    /// Serialize a u64 value to bytes
    pub fn serialize_u64(value: u64) -> Vec<u8> {
        value.to_le_bytes().to_vec()
    }
    
    /// Serialize a u8 value to bytes
    pub fn serialize_u8(value: u8) -> Vec<u8> {
        vec![value]
    }
    
    /// Serialize a string to bytes
    pub fn serialize_string(value: &str) -> Vec<u8> {
        value.as_bytes().to_vec()
    }
    
    /// Serialize a bytes array to bytes (identity function)
    pub fn serialize_bytes(value: &[u8]) -> Vec<u8> {
        value.to_vec()
    }
}