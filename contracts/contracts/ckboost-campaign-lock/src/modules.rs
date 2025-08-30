use alloc::vec;
use alloc::vec::Vec;
use ckb_deterministic::{
    cell_classifier::RuleBasedClassifier, debug_info, debug_trace
};
use ckboost_shared::transaction_context::TransactionContext;
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{
        packed::{Byte32Vec, Transaction},
        prelude::*,
    },
    high_level::{load_cell_type_hash, load_script, load_witness_args}
};
use ckboost_shared::{
    types::{CampaignData, ConnectedTypeID},
    Error,
};

pub struct CKBoostCampaignLock;

use crate::{recipes, ssri::CKBoostCampaign};

impl CKBoostCampaign for CKBoostCampaignLock {
    fn update_campaign(
        _tx: Option<Transaction>,
        _campaign_data: CampaignData,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostCampaignLock::update_campaign - Not implemented for lock script");
        // Lock scripts don't typically build transactions for campaign updates
        // This is handled by the type script
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_update_campaign(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("CKBoostCampaignLock::verify_update_campaign - Starting validation");
        
        // For lock script, we validate that the campaign admin is unlocking
        // This happens when the campaign cell is being updated
        recipes::approve_completion::validate_approve_completion(context)
            .map_err(|e| e.into())
    }
    
    fn approve_completion(
        _tx: Option<Transaction>,
        _campaign_data: CampaignData,
        _quest_id: u32,
        _user_type_ids: Byte32Vec,
    ) -> Result<Transaction, Error> {
        debug_trace!("CKBoostCampaignLock::approve_completion - Not implemented for lock script");
        // Lock scripts don't build approval transactions
        // This is handled by the type script
        Err(Error::SSRIMethodsNotImplemented)
    }
    
    fn verify_approve_completion(
        context: &TransactionContext<RuleBasedClassifier>,
    ) -> Result<(), Error> {
        debug_trace!("CKBoostCampaignLock::verify_approve_completion - Starting validation");
        
        // For lock script, we validate that an approved user is claiming rewards
        // This checks the approval proof in the transaction
        recipes::user_claim::validate_user_claim(context)
            .map_err(|e| e.into())
    }
}

// Helper functions for lock validation
impl CKBoostCampaignLock {
    /// Check if an approved user is claiming rewards
    pub fn is_approved_user_claiming(campaign_type_id: &[u8]) -> Result<bool, Error> {
        debug_trace!("Checking if approved user is claiming");
        
        // Check if there's approval data in any witness
        let mut index = 0;
        loop {
            match load_witness_args(index, Source::Input) {
                Ok(witness_args) => {
                    // Check if output_type contains approval proof
                    match witness_args.output_type().to_opt() {
                        Some(output_type) => {
                            // Parse approval proof from output_type field
                            // Format: [method_name][quest_id][user_type_ids]
                            let proof_data = output_type.raw_data();
                            if proof_data.starts_with(b"CKBoostCampaign.approve_completion") {
                                debug_trace!("Found approval proof in witness");
                                return Ok(true);
                            }
                        }
                        None => {
                            // No output_type data in this witness
                        }
                    }
                }
                Err(ckb_std::error::SysError::IndexOutOfBound) => {
                    break;
                }
                Err(_e) => {
                    // Continue checking other witnesses
                }
            }
            index += 1;
        }
        
        Ok(false)
    }
}