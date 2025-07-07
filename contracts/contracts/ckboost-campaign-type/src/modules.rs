#![no_std]

extern crate alloc;

use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::*},
    high_level::{load_cell_data, load_cell_type, load_script_hash},
    debug,
};
use crate::error::{Error, Result};
use crate::generated::ckboost::*;
use alloc::{string::String, vec::Vec};
use core::convert::TryInto;

/// Campaign operations handler
pub struct CampaignHandler;

impl CampaignHandler {
    /// Create a new campaign
    pub fn create_campaign(
        &self,
        campaign_id: &[u8; 32],
        metadata: &[u8],
        funding_config: &[u8],
        initial_funding: u64,
    ) -> Result<()> {
        debug!("Creating campaign with ID: {:?}", campaign_id);
        
        // Validate campaign creation transaction
        crate::campaign_logic::validate_campaign_creation()?;
        
        // Additional SSRI-specific validation can be added here
        
        Ok(())
    }

    /// Add a quest to a campaign
    pub fn add_quest(&self, campaign_id: &[u8; 32], quest_data: &[u8]) -> Result<()> {
        debug!("Adding quest to campaign: {:?}", campaign_id);
        
        // Validate campaign update transaction
        crate::campaign_logic::validate_campaign_update()?;
        
        // Additional quest-specific validation can be added here
        
        Ok(())
    }

    /// Complete a quest
    pub fn complete_quest(&self, quest_id: &[u8; 32], proof_data: &[u8]) -> Result<()> {
        debug!("Completing quest: {:?}", quest_id);
        
        // Validate campaign update transaction
        crate::campaign_logic::validate_campaign_update()?;
        
        // Additional quest completion validation can be added here
        
        Ok(())
    }

    /// Distribute rewards for a quest
    pub fn distribute_rewards(&self, quest_id: &[u8; 32], participants: &[u8]) -> Result<()> {
        debug!("Distributing rewards for quest: {:?}", quest_id);
        
        // Validate campaign update transaction
        crate::campaign_logic::validate_campaign_update()?;
        
        // Additional reward distribution validation can be added here
        
        Ok(())
    }

    /// Query campaign information
    pub fn query_campaign(&self, campaign_id: &[u8; 32]) -> Result<Vec<u8>> {
        debug!("Querying campaign: {:?}", campaign_id);
        
        // Load campaign data from the first output with matching type
        let campaign_data = self.load_campaign_by_id(campaign_id)?;
        
        // Serialize campaign data for return
        Ok(campaign_data.as_bytes().to_vec())
    }

    /// Query quest information
    pub fn query_quest(&self, quest_id: &[u8; 32]) -> Result<Vec<u8>> {
        debug!("Querying quest: {:?}", quest_id);
        
        // For now, return empty data - this would need to be implemented
        // based on how quest data is stored in the campaign structure
        Ok(Vec::new())
    }

    /// Helper function to load campaign data by ID
    fn load_campaign_by_id(&self, campaign_id: &[u8; 32]) -> Result<CampaignData> {
        // Get current script hash
        let current_script_hash = load_script_hash()?;
        
        // Look for campaign in outputs first, then inputs
        for source in [Source::Output, Source::Input] {
            let mut index = 0;
            loop {
                match load_cell_type(index, source) {
                    Ok(Some(script)) => {
                        if script.calc_script_hash().as_slice() == current_script_hash.as_slice() {
                            // Found a cell with our type script, load and check if it matches
                            let data = load_cell_data(index, source)?;
                            let campaign_data = CampaignData::from_slice(&data)
                                .map_err(|_| Error::InvalidCampaignData)?
                                .to_entity();
                            
                            if campaign_data.id().as_slice() == campaign_id {
                                return Ok(campaign_data);
                            }
                        }
                    }
                    Ok(None) => {
                        // Cell has no type script, continue
                    }
                    Err(_) => {
                        // No more cells in this source
                        break;
                    }
                }
                index += 1;
            }
        }
        
        Err(Error::CampaignNotFound)
    }

    /// Get campaign name (for SSRI compatibility)
    pub fn get_campaign_name(&self) -> Result<String> {
        // Return the contract name
        Ok("CKBoost Campaign".into())
    }

    /// Get campaign symbol (for SSRI compatibility)  
    pub fn get_campaign_symbol(&self) -> Result<String> {
        // Return the contract symbol
        Ok("CKBOOST".into())
    }

    /// Get campaign decimals (for SSRI compatibility with token-like behavior)
    pub fn get_campaign_decimals(&self) -> Result<u8> {
        // Return standard decimals for CKB (8 decimals)
        Ok(8)
    }

    /// Get total supply of campaign tokens (if applicable)
    pub fn get_total_supply(&self) -> Result<u64> {
        // This would need to be implemented based on the campaign's token economics
        Ok(0)
    }

    /// Get campaign metadata
    pub fn get_metadata(&self, campaign_id: &[u8; 32]) -> Result<Vec<u8>> {
        let campaign_data = self.load_campaign_by_id(campaign_id)?;
        Ok(campaign_data.metadata().as_bytes().to_vec())
    }

    /// Get campaign status
    pub fn get_status(&self, campaign_id: &[u8; 32]) -> Result<u8> {
        let campaign_data = self.load_campaign_by_id(campaign_id)?;
        Ok(campaign_data.status().as_slice()[0])
    }

    /// Get campaign funding information
    pub fn get_funding_info(&self, campaign_id: &[u8; 32]) -> Result<Vec<u8>> {
        let campaign_data = self.load_campaign_by_id(campaign_id)?;
        Ok(campaign_data.funding_info().as_bytes().to_vec())
    }

    /// Get campaign quest count
    pub fn get_quest_count(&self, campaign_id: &[u8; 32]) -> Result<u64> {
        let campaign_data = self.load_campaign_by_id(campaign_id)?;
        let quest_count = u64::from_le_bytes(
            campaign_data.quest_count().as_slice().try_into()
                .map_err(|_| Error::InvalidCampaignData)?
        );
        Ok(quest_count)
    }

    /// Validate campaign state transitions
    pub fn validate_status_transition(&self, from: u8, to: u8) -> Result<()> {
        crate::campaign_logic::validate_campaign_status_transition(from, to)
    }

    /// Validate campaign data structure
    pub fn validate_campaign_data(&self, campaign_data: &CampaignData) -> Result<()> {
        crate::campaign_logic::validate_campaign_data_structure(campaign_data)
    }

    /// Validate campaign funding configuration
    pub fn validate_funding_config(&self, campaign_data: &CampaignData) -> Result<()> {
        crate::campaign_logic::validate_campaign_funding_config(campaign_data)
    }
}

/// Default campaign handler instance
pub static CAMPAIGN_HANDLER: CampaignHandler = CampaignHandler;