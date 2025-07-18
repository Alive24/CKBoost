use ckboost_shared::{
    types::UserVerificationData, 
    Error,
};
use ckb_std::debug;

pub struct CKBoostUserType;

use crate::ssri::CKBoostUser;

impl CKBoostUser for CKBoostUserType {
    fn update_user_verification(
        _user_verification_data: UserVerificationData,
    ) -> Result<(), Error> {
        debug!("CKBoostUserType::update_user_verification - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_update_user_verification() -> Result<(), Error> {
        debug!("CKBoostUserType::verify_update_user_verification - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
}