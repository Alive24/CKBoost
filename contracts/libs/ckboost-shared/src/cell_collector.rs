// CKBoost-specific cell classifier creation using ckb_deterministic library
use crate::error::Error;
use alloc::{format, string::String, vec::Vec};
pub use ckb_deterministic::cell_classifier::{
    CellClass, CellCollector, CellInfo, ClassificationRule, ClassifiedCells, RuleBasedClassifier,
};
use ckb_deterministic::{cell_classifier::ScriptType, debug_trace};
use ckb_std::ckb_types::{packed::{Byte32, Bytes, Script}, prelude::*};
use molecule::prelude::{Entity, Builder};

/// Create a CKBoost classifier with protocol-specific rules
pub fn create_ckboost_classifier(
    data: &crate::protocol_data::ProtocolData,
) -> Result<RuleBasedClassifier, Error> {
    use crate::protocol_data::ProtocolDataExt;
    debug_trace!("Creating CKBoost classifier from protocol data");

    let accepted_udt_type_script = data.accepted_udt_type_scripts();

    // Get known script info
    let xudt_info = crate::known_script::get_known_script("xudt");
    let spore_info = crate::known_script::get_known_script("spore");
    let type_id_info = crate::known_script::get_known_script("type_id");

    // Start with a basic classifier
    let mut classifier = RuleBasedClassifier::new("CKBoostClassifier")
        .add_known_script(String::from("xudt"), xudt_info.code_hash, xudt_info.hash_type, ScriptType::Type, CellClass::custom("xudt"))
        .add_known_script(String::from("spore"), spore_info.code_hash, spore_info.hash_type, ScriptType::Type, CellClass::custom("spore"))
        .add_known_script(String::from("type_id"), type_id_info.code_hash, type_id_info.hash_type, ScriptType::Type, CellClass::custom("type_id"))
        .add_type_code_hash(data.protocol_type_code_hash(), CellClass::custom("protocol"))
        .add_type_code_hash(data.campaign_type_code_hash(), CellClass::custom("campaign"))
        .add_type_code_hash(data.user_type_code_hash(), CellClass::custom("user"))
        .add_type_code_hash(data.points_udt_type_code_hash(), CellClass::custom("points"));

    for script in accepted_udt_type_script.iter() {
        let std_script = Script::new_builder()
            .code_hash(Byte32::from_slice(&script.code_hash().as_slice()).should_be_ok())
            .hash_type(script.hash_type())
            .args(Bytes::from_slice(&script.args().as_slice()).should_be_ok())
            .build();
        let script_hash: [u8; 32] = std_script.calc_script_hash().unpack();
        let udt_identifier = get_udt_identifier(&script);
        classifier = classifier.add_type_hash(script_hash, CellClass::custom(udt_identifier));
    }

    Ok(classifier)
}

/// Convenience function to create a CKBoost classifier and collector
pub fn create_ckboost_collector() -> Result<CellCollector<RuleBasedClassifier>, Error> {
    let protocol_data = crate::protocol_data::get_protocol_data()?;
    let classifier = create_ckboost_classifier(&protocol_data)?;
    Ok(CellCollector::new(classifier))
}

/// Generate a UDT identifier string from a script
pub fn get_udt_identifier(script: &crate::generated::ckboost::Script) -> String {
    let std_script = Script::new_builder()
        .code_hash(Byte32::from_slice(&script.code_hash().as_slice()).should_be_ok())
        .hash_type(script.hash_type())
        .args(Bytes::from_slice(&script.args().as_slice()).should_be_ok())
        .build();
    let script_hash: [u8; 32] = std_script.calc_script_hash().unpack();
    let hex_string = ckb_std::high_level::encode_hex(&script_hash[0..4]);
    format!("udt_{:?}", hex_string)
}

/// Get all UDT identifiers from protocol data
pub fn get_all_udt_identifiers() -> Result<Vec<String>, Error> {
    use crate::protocol_data::ProtocolDataExt;
    let protocol_data = crate::protocol_data::get_protocol_data()?;
    let accepted_udt_type_script = protocol_data.accepted_udt_type_scripts();
    
    let mut udt_identifiers = Vec::new();
    for script in accepted_udt_type_script.iter() {
        udt_identifiers.push(get_udt_identifier(&script));
    }
    
    Ok(udt_identifiers)
}

/// Convenience function to create a mock CKBoost classifier and collector for testing
#[cfg(test)]
pub fn create_mock_ckboost_collector() -> CellCollector<RuleBasedClassifier> {
    use crate::{generated::ckboost::{Byte32, ProtocolConfig, ProtocolData, ScriptCodeHashes}, types::ScriptVec};
    use molecule::prelude::*;
    
    // Create mock protocol data for testing
    let script_code_hashes = ScriptCodeHashes::new_builder()
        .ckb_boost_protocol_type_code_hash(Byte32::from([1u8; 32]))
        .ckb_boost_protocol_lock_code_hash(Byte32::from([11u8; 32]))
        .ckb_boost_campaign_type_code_hash(Byte32::from([2u8; 32]))
        .ckb_boost_campaign_lock_code_hash(Byte32::from([12u8; 32]))
        .ckb_boost_user_type_code_hash(Byte32::from([3u8; 32]))
        .accepted_udt_type_scripts(ScriptVec::new_builder().build())
        .accepted_dob_type_scripts(ScriptVec::new_builder().build())
        .build();
        
    let protocol_config = ProtocolConfig::new_builder()
        .script_code_hashes(script_code_hashes)
        .build();
        
    let protocol_data = ProtocolData::new_builder()
        .protocol_config(protocol_config)
        .build();
    
    let classifier = create_ckboost_classifier(&protocol_data).expect("Mock data should be valid");
    CellCollector::new(classifier)
}

