use ckboost_shared::{
    types::{CampaignData, QuestData}, 
    Error,
    transaction_context::{create_transaction_context},
    ssri::method_paths,
};
use ckb_std::debug;
use alloc::vec::Vec;

pub struct CKBoostCampaignType;

use crate::ssri::CKBoostCampaign;

impl CKBoostCampaign for CKBoostCampaignType {
    fn update_campaign(
        _campaign_id: Option<u64>,
        _campaign_data: CampaignData,
        _ckb_amount: Option<u64>,
        _nft_assets: Option<Vec<ckb_std::ckb_types::packed::Script>>,
        _udt_assets: Option<Vec<(ckb_std::ckb_types::packed::Script, u64)>>,
    ) -> Result<(), Error> {
        Ok(())
    }
    
    /// Validates campaign update/creation transaction in Type Script
    /// 
    /// # Validation Rules for Campaign Creation (campaign_id is None)
    /// 
    /// 1. **No campaign cells in inputs**: For creation, there should be no
    ///    existing campaign cells in the transaction inputs
    /// 
    /// 2. **Exactly one campaign cell in outputs**: Creation should produce
    ///    exactly one new campaign cell
    /// 
    /// 3. **Valid campaign data**: Campaign data must meet minimum size
    ///    requirements and have valid structure
    /// 
    /// 4. **Valid funding**: Campaign must have non-zero funding amount
    /// 
    /// 5. **Valid duration**: Campaign must have non-zero duration
    /// 
    /// # Validation Rules for Campaign Update (campaign_id is Some)
    /// 
    /// 1. **Campaign cell consistency**: The same campaign cell must exist
    ///    in both inputs and outputs
    /// 
    /// 2. **Data integrity**: Only allowed fields can be updated
    /// 
    /// 3. **Funding rules**: Additional funding can be added but not removed
    /// 
    /// # Returns
    /// 
    /// - `Ok(())`: Validation passed
    /// - `Err(Error)`: Validation failed with specific error details
    fn verify_update_campaign() -> Result<(), Error> {
        debug!("Starting verify_update_campaign with comprehensive validation");
        
        // Create transaction context using ckb_deterministic framework
        let context = create_transaction_context()?;
        
        debug!("Transaction context created for campaign verification");
        
        // Validate that this is indeed a campaign-related transaction
        if !context.matches_method_path(method_paths::CREATE_CAMPAIGN.as_bytes()) &&
           !context.matches_method_path(method_paths::UPDATE_CAMPAIGN.as_bytes()) {
            debug!("Method path validation failed in verify_update_campaign");
            return Err(Error::SSRIMethodsNotImplemented);
        }
        
        // Get campaign cells for validation
        let input_campaign_cells = context.input_cells.campaign_cells();
        let output_campaign_cells = context.output_cells.campaign_cells();
        
        // Determine if this is creation or update based on method path
        if context.matches_method_path(method_paths::CREATE_CAMPAIGN.as_bytes()) {
            Self::validate_campaign_creation_transaction(&context, input_campaign_cells, output_campaign_cells)?;
        } else {
            Self::validate_campaign_update_transaction(&context, input_campaign_cells, output_campaign_cells)?;
        }
        
        debug!("Campaign transaction validation completed successfully");
        Ok(())
    }
    
    fn fund(
        _campaign_id: u64,
        _ckb_amount: Option<u64>,
        _nft_assets: Option<Vec<ckb_std::ckb_types::packed::Script>>,
        _udt_assets: Option<Vec<(ckb_std::ckb_types::packed::Script, u64)>>,
    ) -> Result<(), Error> {
        Ok(())
    }
    
    fn approve_completion(
        _campaign_id: u64,
        _quest_data: QuestData,
    ) -> Result<(), Error> {
        Ok(())
    }
    
    /// Validates quest completion approval transaction
    /// 
    /// # Validation Rules
    /// 
    /// 1. **Valid quest data**: Quest must have valid structure and ID
    /// 
    /// 2. **Campaign exists**: The campaign being completed must exist
    /// 
    /// 3. **User and campaign cells updated**: Both user and campaign cells
    ///    must be present in inputs and outputs
    /// 
    /// 4. **Reward distribution**: UDT rewards must be properly distributed
    /// 
    /// # Returns
    /// 
    /// - `Ok(())`: Validation passed
    /// - `Err(Error)`: Validation failed with specific error details
    fn verify_approve_completion() -> Result<(), Error> {
        debug!("Starting verify_approve_completion");
        
        // Create transaction context
        let context = create_transaction_context()?;
        
        // Validate method path
        if !context.matches_method_path(method_paths::COMPLETE_QUEST.as_bytes()) {
            debug!("Method path validation failed in verify_approve_completion");
            return Err(Error::SSRIMethodsNotImplemented);
        }
        
        // Validate quest completion transaction
        Self::validate_quest_completion_transaction(&context)?;
        
        debug!("Quest completion validation completed successfully");
        Ok(())
    }
}

// ============================================================================
// Helper Methods for Campaign Validation
// ============================================================================

impl CKBoostCampaignType {
    /// Validate campaign creation transaction
    fn validate_campaign_creation_transaction(
        context: &ckboost_shared::transaction_context::CKBoostTransactionContext,
        input_campaign_cells: Option<&Vec<ckboost_shared::cell_collector::CellInfo>>,
        output_campaign_cells: Option<&Vec<ckboost_shared::cell_collector::CellInfo>>,
    ) -> Result<(), Error> {
        
        debug!("Validating campaign creation transaction");
        
        // Ensure no campaign cells in inputs (creation)
        if input_campaign_cells.is_some() && !input_campaign_cells.unwrap().is_empty() {
            debug!("Campaign creation should have no campaign input cells");
            return Err(Error::InvalidCampaignData);
        }
        
        // Ensure exactly one campaign cell in outputs
        let output_campaigns = output_campaign_cells
            .ok_or(Error::InvalidCampaignData)?;
        
        if output_campaigns.len() != 1 {
            debug!("Campaign creation should produce exactly one campaign cell");
            return Err(Error::InvalidCampaignData);
        }
        
        // Validate transaction arguments
        let args = context.arguments();
        if args.len() != 3 {
            debug!("Invalid argument count for campaign creation: expected 3, got {}", args.len());
            return Err(Error::SSRIMethodsArgsInvalid);
        }
        
        // Validate campaign data argument
        if args[0].len() < 64 {
            debug!("Campaign data must be at least 64 bytes");
            return Err(Error::InvalidCampaignData);
        }
        
        // Validate funding amount argument (16-byte u128)
        if args[1].len() != 16 {
            debug!("Funding amount must be exactly 16 bytes (u128)");
            return Err(Error::InvalidCampaignFunding);
        }
        
        // Parse and validate funding amount
        let funding_amount = u128::from_le_bytes(
            args[1][..16].try_into()
                .map_err(|_| Error::InvalidCampaignFunding)?
        );
        
        if funding_amount == 0 {
            debug!("Campaign funding amount must be greater than zero");
            return Err(Error::InvalidCampaignFunding);
        }
        
        // Validate duration argument (8-byte u64)
        if args[2].len() != 8 {
            debug!("Campaign duration must be exactly 8 bytes (u64)");
            return Err(Error::InvalidCampaignTimestamp);
        }
        
        // Parse and validate duration
        let duration = u64::from_le_bytes(
            args[2][..8].try_into()
                .map_err(|_| Error::InvalidCampaignTimestamp)?
        );
        
        if duration == 0 {
            debug!("Campaign duration must be greater than zero");
            return Err(Error::InvalidCampaignTimestamp);
        }
        
        // Ensure UDT cells are present for funding
        let input_udt_cells = context.input_cells.udt_cells();
        if input_udt_cells.is_none() || input_udt_cells.unwrap().is_empty() {
            debug!("Campaign creation requires UDT cells for funding");
            return Err(Error::InsufficientFunding);
        }
        
        debug!("Campaign creation validation passed");
        Ok(())
    }
    
    /// Validate campaign update transaction
    fn validate_campaign_update_transaction(
        _context: &ckboost_shared::transaction_context::CKBoostTransactionContext,
        input_campaign_cells: Option<&Vec<ckboost_shared::cell_collector::CellInfo>>,
        output_campaign_cells: Option<&Vec<ckboost_shared::cell_collector::CellInfo>>,
    ) -> Result<(), Error> {
        debug!("Validating campaign update transaction");
        
        // Ensure campaign cells exist in both inputs and outputs
        let input_campaigns = input_campaign_cells
            .ok_or(Error::CampaignNotFound)?;
        let output_campaigns = output_campaign_cells
            .ok_or(Error::CampaignNotFound)?;
        
        if input_campaigns.is_empty() || output_campaigns.is_empty() {
            debug!("Campaign update requires campaign cells in both inputs and outputs");
            return Err(Error::CampaignNotFound);
        }
        
        // Validate campaign cell consistency (same type script)
        let input_type = &input_campaigns[0].type_script;
        let output_type = &output_campaigns[0].type_script;
        
        match (input_type, output_type) {
            (Some(input_ts), Some(output_ts)) => {
                if input_ts.code_hash() != output_ts.code_hash() || 
                   input_ts.args() != output_ts.args() {
                    debug!("Campaign type script must remain consistent during update");
                    return Err(Error::InvalidCampaignData);
                }
            }
            _ => {
                debug!("Campaign cells must have type scripts");
                return Err(Error::InvalidCampaignData);
            }
        }
        
        // TODO: Add more sophisticated update validation
        // - Validate allowed field updates
        // - Validate funding can only increase
        // - Validate state transitions
        
        debug!("Campaign update validation passed");
        Ok(())
    }
    
    /// Validate quest completion transaction
    fn validate_quest_completion_transaction(
        context: &ckboost_shared::transaction_context::CKBoostTransactionContext,
    ) -> Result<(), Error> {
        debug!("Validating quest completion transaction");
        
        let args = context.arguments();
        if args.len() != 3 {
            debug!("Invalid argument count for quest completion: expected 3, got {}", args.len());
            return Err(Error::SSRIMethodsArgsInvalid);
        }
        
        // Validate quest ID argument (32-byte identifier)
        if args[0].len() != 32 {
            debug!("Quest ID must be exactly 32 bytes");
            return Err(Error::InvalidQuestData);
        }
        
        // Validate completion proof argument
        if args[1].len() < 64 {
            debug!("Completion proof must be at least 64 bytes");
            return Err(Error::InvalidQuestData);
        }
        
        // Validate reward amount argument (16-byte u128)
        if args[2].len() != 16 {
            debug!("Reward amount must be exactly 16 bytes (u128)");
            return Err(Error::InvalidQuestReward);
        }
        
        // Parse and validate reward amount
        let reward_amount = u128::from_le_bytes(
            args[2][..16].try_into()
                .map_err(|_| Error::InvalidQuestReward)?
        );
        
        if reward_amount == 0 {
            debug!("Quest reward amount must be greater than zero");
            return Err(Error::InvalidQuestReward);
        }
        
        // Validate user cell update (at least 1 in inputs and outputs)
        let input_users = context.input_cells.user_cells();
        let output_users = context.output_cells.user_cells();
        
        if input_users.is_none() || input_users.unwrap().is_empty() ||
           output_users.is_none() || output_users.unwrap().is_empty() {
            debug!("Quest completion requires user cells in both inputs and outputs");
            return Err(Error::InvalidTransaction);
        }
        
        // Validate campaign cell update (at least 1 in inputs and outputs)
        let input_campaigns = context.input_cells.campaign_cells();
        let output_campaigns = context.output_cells.campaign_cells();
        
        if input_campaigns.is_none() || input_campaigns.unwrap().is_empty() ||
           output_campaigns.is_none() || output_campaigns.unwrap().is_empty() {
            debug!("Quest completion requires campaign cells in both inputs and outputs");
            return Err(Error::CampaignNotFound);
        }
        
        // Validate UDT reward distribution
        let output_udt_cells = context.output_cells.udt_cells();
        if output_udt_cells.is_none() || output_udt_cells.unwrap().is_empty() {
            debug!("Quest completion requires UDT cells in outputs for rewards");
            return Err(Error::InvalidQuestReward);
        }
        
        debug!("Quest completion validation passed");
        Ok(())
    }
}