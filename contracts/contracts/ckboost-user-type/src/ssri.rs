use ckboost_shared::{
    types::UserVerificationData,
    Error,
};

/// CKBoost User SSRI trait for user management operations
#[allow(dead_code)]
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
}