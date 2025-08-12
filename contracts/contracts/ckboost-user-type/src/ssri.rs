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
    /// Update user verification status
    /// 
    /// # Arguments
    /// 
    /// * `user_verification_data` - The user verification data including profile and proof
    fn update_user_verification(
        user_verification_data: UserVerificationData,
    ) -> Result<(), Error>;
    
    /// Verify user verification update transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_update_user_verification() -> Result<(), Error>;
    
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
    
    /// Update user data (for future extensions)
    /// 
    /// # Arguments
    /// 
    /// * `tx` - Optional existing transaction to build upon
    /// * `user_data` - The updated user data
    /// 
    /// # Returns
    /// 
    /// Returns a transaction with the user cell updated
    fn update_user(
        tx: Option<Transaction>,
        user_data: UserData,
    ) -> Result<Transaction, Error>;
    
    /// Verify user update transaction in Type Script
    /// This method is called automatically by the type script to validate transactions
    fn verify_update_user(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error>;
}