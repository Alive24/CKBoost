use ckboost_shared::{
    types::{CampaignData, QuestData}, 
    Error,
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
        debug!("CKBoostCampaignType::update_campaign - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_update_campaign() -> Result<(), Error> {
        debug!("CKBoostCampaignType::verify_update_campaign - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn fund(
        _campaign_id: u64,
        _ckb_amount: Option<u64>,
        _nft_assets: Option<Vec<ckb_std::ckb_types::packed::Script>>,
        _udt_assets: Option<Vec<(ckb_std::ckb_types::packed::Script, u64)>>,
    ) -> Result<(), Error> {
        debug!("CKBoostCampaignType::fund - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn approve_completion(
        _campaign_id: u64,
        _quest_data: QuestData,
    ) -> Result<(), Error> {
        debug!("CKBoostCampaignType::approve_completion - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_approve_completion() -> Result<(), Error> {
        debug!("CKBoostCampaignType::verify_approve_completion - SSRI method not implemented");
        Err(Error::SSRIMethodsNotImplemented)
    }
}