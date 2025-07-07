#![cfg(test)]

use crate::campaign_logic::*;
use crate::error::Error;
use crate::generated::ckboost::*;
use ckb_std::ckb_types::{bytes::Bytes, prelude::*};

/// Test campaign status transitions
#[test]
fn test_campaign_status_transitions() {
    // Valid transitions
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_FUNDING, 
        CAMPAIGN_STATUS_ACTIVE
    ).is_ok());
    
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_FUNDING, 
        CAMPAIGN_STATUS_CANCELLED
    ).is_ok());
    
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_ACTIVE, 
        CAMPAIGN_STATUS_COMPLETED
    ).is_ok());
    
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_ACTIVE, 
        CAMPAIGN_STATUS_PAUSED
    ).is_ok());
    
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_PAUSED, 
        CAMPAIGN_STATUS_ACTIVE
    ).is_ok());
    
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_PAUSED, 
        CAMPAIGN_STATUS_CANCELLED
    ).is_ok());
    
    // Same status should be valid
    assert!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_ACTIVE, 
        CAMPAIGN_STATUS_ACTIVE
    ).is_ok());
    
    // Invalid transitions
    assert_eq!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_COMPLETED, 
        CAMPAIGN_STATUS_ACTIVE
    ), Err(Error::InvalidCampaignState));
    
    assert_eq!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_CANCELLED, 
        CAMPAIGN_STATUS_ACTIVE
    ), Err(Error::InvalidCampaignState));
    
    assert_eq!(validate_campaign_status_transition(
        CAMPAIGN_STATUS_ACTIVE, 
        CAMPAIGN_STATUS_FUNDING
    ), Err(Error::InvalidCampaignState));
}

/// Test campaign data structure validation
#[test]
fn test_validate_campaign_data_structure() {
    // Create a valid campaign data
    let campaign_data = create_test_campaign();
    
    // Should pass validation
    assert!(validate_campaign_data_structure(&campaign_data).is_ok());
}

/// Test campaign initial state validation
#[test]
fn test_validate_campaign_initial_state() {
    let campaign_data = create_test_campaign();
    
    // Should pass validation for new campaign
    assert!(validate_campaign_initial_state(&campaign_data).is_ok());
    
    // Test with invalid quest count
    let invalid_campaign = CampaignDataBuilder::default()
        .id(create_test_id())
        .creator(create_test_script())
        .metadata(create_test_metadata())
        .funding_info(create_test_funding())
        .quest_count(create_test_uint64(5)) // Should be 0 for new campaign
        .status(create_test_byte(CAMPAIGN_STATUS_FUNDING))
        .created_at(create_test_uint64(1234567890))
        .activated_at(create_test_uint64(0))
        .build();
    
    assert_eq!(validate_campaign_initial_state(&invalid_campaign), 
               Err(Error::InvalidCampaignData));
}

/// Test campaign funding configuration validation
#[test]
fn test_validate_campaign_funding_config() {
    let campaign_data = create_test_campaign();
    
    // Should pass validation
    assert!(validate_campaign_funding_config(&campaign_data).is_ok());
    
    // Test with zero target amount
    let invalid_funding = CampaignFundingBuilder::default()
        .target_amount(create_test_uint64(0)) // Invalid: zero target
        .current_amount(create_test_uint64(0))
        .funding_deadline(create_test_uint64(1234567890))
        .min_funding_threshold(create_test_uint64(100))
        .build();
    
    let invalid_campaign = CampaignDataBuilder::default()
        .id(create_test_id())
        .creator(create_test_script())
        .metadata(create_test_metadata())
        .funding_info(invalid_funding)
        .quest_count(create_test_uint64(0))
        .status(create_test_byte(CAMPAIGN_STATUS_FUNDING))
        .created_at(create_test_uint64(1234567890))
        .activated_at(create_test_uint64(0))
        .build();
    
    assert_eq!(validate_campaign_funding_config(&invalid_campaign), 
               Err(Error::InvalidCampaignFunding));
}

/// Helper function to create test campaign data
fn create_test_campaign() -> CampaignData {
    CampaignDataBuilder::default()
        .id(create_test_id())
        .creator(create_test_script())
        .metadata(create_test_metadata())
        .funding_info(create_test_funding())
        .quest_count(create_test_uint64(0))
        .status(create_test_byte(CAMPAIGN_STATUS_FUNDING))
        .created_at(create_test_uint64(1234567890))
        .activated_at(create_test_uint64(0))
        .build()
}

/// Helper function to create test ID
fn create_test_id() -> Byte32 {
    let mut id_bytes = [0u8; 32];
    id_bytes[0] = 1; // Non-zero to pass validation
    Byte32::new_builder()
        .set(id_bytes.iter().map(|&b| b.into()).collect())
        .build()
}

/// Helper function to create test script
fn create_test_script() -> Script {
    ScriptBuilder::default()
        .code_hash(create_test_id())
        .hash_type(1u8.into())
        .args(Bytes::from(vec![1, 2, 3, 4]).pack())
        .build()
}

/// Helper function to create test metadata
fn create_test_metadata() -> Bytes {
    Bytes::from(b"Test campaign metadata".to_vec()).pack()
}

/// Helper function to create test funding info
fn create_test_funding() -> CampaignFunding {
    CampaignFundingBuilder::default()
        .target_amount(create_test_uint64(1000))
        .current_amount(create_test_uint64(0))
        .funding_deadline(create_test_uint64(1234567890))
        .min_funding_threshold(create_test_uint64(100))
        .build()
}

/// Helper function to create test uint64
fn create_test_uint64(value: u64) -> Uint64 {
    Uint64::new_builder()
        .set(value.to_le_bytes().iter().map(|&b| b.into()).collect())
        .build()
}

/// Helper function to create test byte
fn create_test_byte(value: u8) -> Byte {
    value.into()
}