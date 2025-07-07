#![no_std]

use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::*},
    high_level::{load_cell_data, load_cell_type, load_script, load_script_hash},
    debug,
};
use crate::error::{Error, Result};
use crate::generated::ckboost::*;
/// Campaign status constants
pub const CAMPAIGN_STATUS_FUNDING: u8 = 0;
pub const CAMPAIGN_STATUS_ACTIVE: u8 = 1;
pub const CAMPAIGN_STATUS_COMPLETED: u8 = 2;
pub const CAMPAIGN_STATUS_CANCELLED: u8 = 3;
pub const CAMPAIGN_STATUS_PAUSED: u8 = 4;

/// Quest status constants
pub const QUEST_STATUS_ACTIVE: u8 = 0;
pub const QUEST_STATUS_COMPLETED: u8 = 1;
pub const QUEST_STATUS_CANCELLED: u8 = 2;

/// Main entry point for campaign type script (standard validation only)
pub fn main() -> Result<()> {
    debug!("Campaign type script started - standard validation");
    
    // Standard type script validation
    validate_campaign_transaction()
}

/// Validates campaign-related transactions
fn validate_campaign_transaction() -> Result<()> {
    debug!("Validating campaign transaction");
    
    // Get current script hash for comparison
    let current_script_hash = load_script_hash()?;
    
    // Count inputs and outputs with this type script
    let input_count = count_cells_with_type(Source::Input, &current_script_hash)?;
    let output_count = count_cells_with_type(Source::Output, &current_script_hash)?;
    
    debug!("Campaign cells: inputs={}, outputs={}", input_count, output_count);
    
    match (input_count, output_count) {
        (0, 1) => {
            // Campaign creation
            debug!("Validating campaign creation");
            validate_campaign_creation()
        }
        (1, 1) => {
            // Campaign update
            debug!("Validating campaign update");
            validate_campaign_update()
        }
        (1, 0) => {
            // Campaign deletion (should not be allowed)
            debug!("Campaign deletion not allowed");
            Err(Error::InvalidTransaction)
        }
        _ => {
            // Invalid transaction structure
            debug!("Invalid campaign transaction structure");
            Err(Error::InvalidTransaction)
        }
    }
}

/// Count cells with specific type script
fn count_cells_with_type(source: Source, target_type_hash: &[u8]) -> Result<usize> {
    let mut count = 0;
    let mut index = 0;
    
    loop {
        match load_cell_type(index, source) {
            Ok(Some(script)) => {
                if script.calc_script_hash().as_slice() == target_type_hash {
                    count += 1;
                }
            }
            Ok(None) => {
                // Cell has no type script
            }
            Err(_) => {
                // No more cells
                break;
            }
        }
        index += 1;
    }
    
    Ok(count)
}

/// Validates campaign creation transaction
pub fn validate_campaign_creation() -> Result<()> {
    debug!("Validating campaign creation");
    
    // Load and validate campaign data from the output
    let campaign_data = load_campaign_data(0, Source::Output)?;
    
    // Validate campaign data structure
    validate_campaign_data_structure(&campaign_data)?;
    
    // Validate campaign initial state
    validate_campaign_initial_state(&campaign_data)?;
    
    // Validate campaign metadata
    validate_campaign_metadata(&campaign_data)?;
    
    // Validate campaign funding configuration
    validate_campaign_funding_config(&campaign_data)?;
    
    debug!("Campaign creation validation passed");
    Ok(())
}

/// Validates campaign update transaction
pub fn validate_campaign_update() -> Result<()> {
    debug!("Validating campaign update");
    
    // Load campaign data from input and output
    let input_campaign = load_campaign_data(0, Source::Input)?;
    let output_campaign = load_campaign_data(0, Source::Output)?;
    
    // Validate campaign data structures
    validate_campaign_data_structure(&input_campaign)?;
    validate_campaign_data_structure(&output_campaign)?;
    
    // Validate campaign update rules
    validate_campaign_update_rules(&input_campaign, &output_campaign)?;
    
    debug!("Campaign update validation passed");
    Ok(())
}

/// Load campaign data from specified source and index
fn load_campaign_data(index: usize, source: Source) -> Result<CampaignData> {
    let data = load_cell_data(index, source)?;
    
    CampaignData::from_slice(&data)
        .map_err(|_| Error::InvalidCampaignData)?
        .to_entity()
}

/// Validates campaign data structure
pub fn validate_campaign_data_structure(campaign: &CampaignData) -> Result<()> {
    debug!("Validating campaign data structure");
    
    // Validate campaign ID is not empty
    let id = campaign.id();
    if id.as_slice().iter().all(|&b| b == 0) {
        return Err(Error::InvalidCampaignData);
    }
    
    // Validate creator script
    let creator = campaign.creator();
    if creator.as_slice().is_empty() {
        return Err(Error::InvalidCampaignCreator);
    }
    
    // Validate funding info
    let funding = campaign.funding_info();
    if funding.target_amount().as_slice().iter().all(|&b| b == 0) {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Validate timestamps
    let created_at = campaign.created_at();
    if created_at.as_slice().iter().all(|&b| b == 0) {
        return Err(Error::InvalidCampaignTimestamp);
    }
    
    Ok(())
}

/// Validates campaign initial state for creation
pub fn validate_campaign_initial_state(campaign: &CampaignData) -> Result<()> {
    debug!("Validating campaign initial state");
    
    // Check quest count is 0 for new campaigns
    let quest_count = u64::from_le_bytes(
        campaign.quest_count().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignData)?
    );
    
    if quest_count != 0 {
        return Err(Error::InvalidCampaignData);
    }
    
    // Check status is funding for new campaigns
    let status = campaign.status().as_slice()[0];
    if status != CAMPAIGN_STATUS_FUNDING {
        return Err(Error::InvalidCampaignState);
    }
    
    // Check activated_at is 0 for new campaigns
    let activated_at = campaign.activated_at();
    if !activated_at.as_slice().iter().all(|&b| b == 0) {
        return Err(Error::InvalidCampaignData);
    }
    
    Ok(())
}

/// Validates campaign metadata
fn validate_campaign_metadata(campaign: &CampaignData) -> Result<()> {
    debug!("Validating campaign metadata");
    
    let metadata = campaign.metadata();
    
    // Metadata should not be empty
    if metadata.as_slice().is_empty() {
        return Err(Error::InvalidCampaignData);
    }
    
    // Metadata should be reasonable size (max 64KB)
    if metadata.as_slice().len() > 65536 {
        return Err(Error::InvalidCampaignData);
    }
    
    Ok(())
}

/// Validates campaign funding configuration
pub fn validate_campaign_funding_config(campaign: &CampaignData) -> Result<()> {
    debug!("Validating campaign funding config");
    
    let funding = campaign.funding_info();
    
    // Validate target amount
    let target_amount = u64::from_le_bytes(
        funding.target_amount().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    if target_amount == 0 {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Validate current amount is <= target amount
    let current_amount = u64::from_le_bytes(
        funding.current_amount().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    if current_amount > target_amount {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Validate funding deadline
    let deadline = u64::from_le_bytes(
        funding.funding_deadline().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    if deadline == 0 {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Validate minimum threshold
    let min_threshold = u64::from_le_bytes(
        funding.min_funding_threshold().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    if min_threshold > target_amount {
        return Err(Error::InvalidCampaignFunding);
    }
    
    Ok(())
}

/// Validates campaign update rules
fn validate_campaign_update_rules(
    input_campaign: &CampaignData,
    output_campaign: &CampaignData,
) -> Result<()> {
    debug!("Validating campaign update rules");
    
    // Campaign ID must not change
    if input_campaign.id().as_slice() != output_campaign.id().as_slice() {
        return Err(Error::InvalidCampaignData);
    }
    
    // Creator must not change
    if input_campaign.creator().as_slice() != output_campaign.creator().as_slice() {
        return Err(Error::InvalidCampaignCreator);
    }
    
    // Created timestamp must not change
    if input_campaign.created_at().as_slice() != output_campaign.created_at().as_slice() {
        return Err(Error::InvalidCampaignTimestamp);
    }
    
    // Validate status transition
    let input_status = input_campaign.status().as_slice()[0];
    let output_status = output_campaign.status().as_slice()[0];
    
    validate_campaign_status_transition(input_status, output_status)?;
    
    // Validate quest count updates
    let input_quest_count = u64::from_le_bytes(
        input_campaign.quest_count().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignData)?
    );
    
    let output_quest_count = u64::from_le_bytes(
        output_campaign.quest_count().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignData)?
    );
    
    // Quest count can only increase
    if output_quest_count < input_quest_count {
        return Err(Error::InvalidCampaignData);
    }
    
    // Validate funding updates
    validate_campaign_funding_updates(
        &input_campaign.funding_info(),
        &output_campaign.funding_info(),
    )?;
    
    Ok(())
}

/// Validates campaign status transitions
pub fn validate_campaign_status_transition(input_status: u8, output_status: u8) -> Result<()> {
    debug!("Validating status transition: {} -> {}", input_status, output_status);
    
    match (input_status, output_status) {
        // Funding -> Active (when funding requirements met)
        (CAMPAIGN_STATUS_FUNDING, CAMPAIGN_STATUS_ACTIVE) => Ok(()),
        // Funding -> Cancelled (funding failed)
        (CAMPAIGN_STATUS_FUNDING, CAMPAIGN_STATUS_CANCELLED) => Ok(()),
        // Active -> Completed (all quests completed)
        (CAMPAIGN_STATUS_ACTIVE, CAMPAIGN_STATUS_COMPLETED) => Ok(()),
        // Active -> Paused (temporary suspension)
        (CAMPAIGN_STATUS_ACTIVE, CAMPAIGN_STATUS_PAUSED) => Ok(()),
        // Paused -> Active (resume)
        (CAMPAIGN_STATUS_PAUSED, CAMPAIGN_STATUS_ACTIVE) => Ok(()),
        // Paused -> Cancelled (permanent stop)
        (CAMPAIGN_STATUS_PAUSED, CAMPAIGN_STATUS_CANCELLED) => Ok(()),
        // Same status (no change)
        (s1, s2) if s1 == s2 => Ok(()),
        // Invalid transitions
        _ => Err(Error::InvalidCampaignState),
    }
}

/// Validates campaign funding updates
fn validate_campaign_funding_updates(
    input_funding: &CampaignFunding,
    output_funding: &CampaignFunding,
) -> Result<()> {
    debug!("Validating funding updates");
    
    // Target amount must not change
    if input_funding.target_amount().as_slice() != output_funding.target_amount().as_slice() {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Funding deadline must not change
    if input_funding.funding_deadline().as_slice() != output_funding.funding_deadline().as_slice() {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Minimum threshold must not change
    if input_funding.min_funding_threshold().as_slice() != output_funding.min_funding_threshold().as_slice() {
        return Err(Error::InvalidCampaignFunding);
    }
    
    // Current amount can only increase
    let input_current = u64::from_le_bytes(
        input_funding.current_amount().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    let output_current = u64::from_le_bytes(
        output_funding.current_amount().as_slice().try_into()
            .map_err(|_| Error::InvalidCampaignFunding)?
    );
    
    if output_current < input_current {
        return Err(Error::InvalidCampaignFunding);
    }
    
    Ok(())
}