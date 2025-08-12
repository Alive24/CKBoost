use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, transaction_context::TransactionContext,
};
use ckboost_shared::{
    types::{CampaignData, QuestData}, Error
};
use ckb_std::ckb_types::packed::Transaction;

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
    /// * `quest_data` - The quest completion data including proof
    /// 
    /// # Returns
    /// 
    /// Returns a transaction with the quest completion processed
    fn approve_completion(
        tx: Option<Transaction>,
        quest_data: QuestData,
    ) -> Result<Transaction, Error>;
    
    /// Verify quest completion approval transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
}