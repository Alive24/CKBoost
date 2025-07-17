// CKBoost-specific cell classifier creation using ckb_deterministic library
use crate::error::Error;
pub use ckb_deterministic::cell_classifier::{
    CellClass, CellCollector, CellInfo, ClassificationRule, ClassifiedCells, RuleBasedClassifier,
};
use ckb_deterministic::known_scripts::KnownScript;

/// Create a CKBoost classifier with protocol-specific rules
pub fn create_ckboost_classifier(
    data: &crate::protocol_data::ProtocolData,
) -> Result<RuleBasedClassifier, Error> {
    use crate::protocol_data::ProtocolDataExt;
    use ckb_std::debug;
    debug!("Creating CKBoost classifier from protocol data");

    // Start with a basic classifier
    let classifier = RuleBasedClassifier::new("CKBoostClassifier")
        .add_known_script(KnownScript::XUdt, KnownScript::XUdt.cell_class())
        .add_known_script(KnownScript::Spore, KnownScript::Spore.cell_class())
        .add_type_code_hash(data.protocol_type_code_hash(), CellClass::custom("protocol"))
        .add_type_code_hash(data.campaign_type_code_hash(), CellClass::custom("campaign"))
        .add_type_code_hash(data.user_type_code_hash(), CellClass::custom("user"));

    Ok(classifier)
}

/// Convenience function to create a CKBoost classifier and collector
pub fn create_ckboost_collector() -> Result<CellCollector<RuleBasedClassifier>, Error> {
    let protocol_data = crate::protocol_data::get_protocol_data()?;
    let classifier = create_ckboost_classifier(&protocol_data)?;
    Ok(CellCollector::new(classifier))
}

/// Convenience function to create a mock CKBoost classifier and collector for testing
pub fn create_mock_ckboost_collector() -> CellCollector<RuleBasedClassifier> {
    use crate::protocol_data::ProtocolDataExt;
    let protocol_data = crate::protocol_data::ProtocolData::mock();
    let classifier = create_ckboost_classifier(&protocol_data).expect("Mock data should be valid");
    CellCollector::new(classifier)
}

