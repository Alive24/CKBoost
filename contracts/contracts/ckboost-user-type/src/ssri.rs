use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, transaction_context::TransactionContext,
};
use ckboost_shared::{
    types::{UserData, UserVerificationData},
    Error,
};
use ckb_std::ckb_types::packed::Transaction;

/// CKBoost User SSRI trait for user management operations
pub trait CKBoostUser {
    fn update_verification_data(
        tx: Option<Transaction>,
        user_verification_data: UserVerificationData,
    ) -> Result<Transaction, Error>;
    
    /// Verify verification data update transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_update_verification_data(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
    
    /// Submit a quest completion
    /// 
    /// # Arguments
    /// 
    /// * `tx` - Optional existing transaction to build upon
    /// * `user_data` - The complete user data including new submission
    /// 
    /// # Returns
    /// 
    /// Returns a transaction with the user cell updated
    fn submit_quest(
        tx: Option<Transaction>,
        user_data: UserData,
    ) -> Result<Transaction, Error>;
    
    /// Verify quest submission transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_submit_quest(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
}