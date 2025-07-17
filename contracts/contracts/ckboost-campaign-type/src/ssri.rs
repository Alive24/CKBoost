use ckboost_shared::{
    types::{CampaignData, QuestData},
    Error,
};
use ckb_std::ckb_types::packed::Script;
use alloc::vec::Vec;

/// CKBoost Campaign SSRI trait for campaign management operations
#[allow(dead_code)]
pub trait CKBoostCampaign {
    /// Create or update a campaign
    /// 
    /// # Arguments
    /// 
    /// * `campaign_id` - If None, creates a new campaign. If Some, updates existing campaign
    /// * `campaign_data` - The campaign configuration and metadata
    /// * `ckb_amount` - Optional CKB funding amount (in addition to occupied capacity)
    /// * `nft_assets` - Optional NFT assets to lock in the campaign
    /// * `udt_assets` - Optional UDT assets with amounts to lock in the campaign
    fn update_campaign(
        campaign_id: Option<u64>,
        campaign_data: CampaignData,
        ckb_amount: Option<u64>,
        nft_assets: Option<Vec<Script>>,
        udt_assets: Option<Vec<(Script, u64)>>,
    ) -> Result<(), Error>;
    
    /// Verify campaign update/creation transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_update_campaign() -> Result<(), Error>;
    
    /// Fund an existing campaign with additional assets
    /// Note: No need to verify fund, just lock the assets to the campaign cell
    /// 
    /// # Arguments
    /// 
    /// * `campaign_id` - The ID of the campaign to fund
    /// * `ckb_amount` - Optional additional CKB funding
    /// * `nft_assets` - Optional NFT assets to add
    /// * `udt_assets` - Optional UDT assets with amounts to add
    fn fund(
        campaign_id: u64,
        ckb_amount: Option<u64>,
        nft_assets: Option<Vec<Script>>,
        udt_assets: Option<Vec<(Script, u64)>>,
    ) -> Result<(), Error>;
    
    /// Approve quest completion and distribute rewards
    /// 
    /// # Arguments
    /// 
    /// * `campaign_id` - The campaign that contains the quest
    /// * `quest_data` - The quest completion data including proof
    fn approve_completion(
        campaign_id: u64,
        quest_data: QuestData,
    ) -> Result<(), Error>;
    
    /// Verify quest completion approval transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_approve_completion() -> Result<(), Error>;
}