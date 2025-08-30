use alloc::vec::Vec;
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier,
};
use ckboost_shared::transaction_context::TransactionContext;
use ckboost_shared::{
    types::{Byte32, CampaignData, UDTAsset}, Error
};
use ckb_std::ckb_types::packed::{Byte32Vec, Transaction};

/// CKBoost Campaign SSRI trait for campaign management operations
pub trait CKBoostCampaign {
    /// Create or update a campaign
    /// 
    /// # Arguments
    /// 
    /// * `tx` - Optional existing transaction to build upon
    /// * `campaign_data` - The campaign configuration and metadata
    /// 
    /// # Returns
    /// 
    /// Returns a transaction with the campaign cell created/updated
    fn update_campaign(
        tx: Option<Transaction>,
        campaign_data: CampaignData,
    ) -> Result<Transaction, Error>;
    
    /// Verify campaign update/creation transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_update_campaign(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
    
    /// Approve quest completion and distribute rewards
    /// 
    /// # Arguments
    /// 
    /// * `tx` - Optional existing transaction to build upon
    /// * `campaign_data` - The current campaign data
    /// * `quest_id` - The ID of the quest being approved
    /// * `user_type_ids` - List of user type IDs to approve
    /// 
    /// # Returns
    /// 
    /// Returns a transaction with the quest completion processed
    fn approve_completion(
        tx: Option<Transaction>,
        campaign_data: CampaignData,
        quest_id: u32,
        user_type_ids: Byte32Vec,
    ) -> Result<Transaction, Error>;
    
    /// Verify quest completion approval transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
}