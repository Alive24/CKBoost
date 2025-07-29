pub use ckb_deterministic::{
    transaction_context::TransactionContext,
    cell_classifier::RuleBasedClassifier,
    errors::Error as DeterministicError,
};
use crate::error::Error;

/// Create a CKBoost transaction context with automatic cell classification
pub fn create_transaction_context() -> Result<TransactionContext<RuleBasedClassifier>, Error> {
    // Create CKBoost-specific cell classifier with protocol data
    let protocol_data = crate::protocol_data::get_protocol_data()?;
    let classifier = crate::cell_collector::create_ckboost_classifier(&protocol_data)?;
    
    // Create cell collector with the classifier
    let collector = ckb_deterministic::cell_classifier::CellCollector::new(classifier);
    
    // Create transaction context using the collector
    let context = TransactionContext::new(collector)?;

    
    Ok(context)
}