use ckboost_shared::{cell_collector::RuleBasedClassifier, transaction_context::TransactionContext, types::{Byte32, ProtocolData, TippingProposalData}, Error};
use ckb_std::ckb_types::packed::Transaction;

#[allow(dead_code)]
pub trait CKBoostProtocol {
    // If the context script cannot locate the protocol cell, will try to create a new one.
    // #[ssri_method(level = "script", transaction = true)]
    fn update_protocol(
        tx: Option<Transaction>,
        protocol_data: ProtocolData,
    ) -> Result<Transaction, Error>;
    fn verify_update_protocol(context: &TransactionContext<RuleBasedClassifier>) -> Result<(), Error>;

    fn update_tipping_proposal(
        protocol_type_hash: Byte32,
        tipping_proposal_data: TippingProposalData,
    ) -> Result<(), Error>;
    fn verify_update_tipping_proposal(context: &TransactionContext<RuleBasedClassifier>) -> Result<(), Error>;
}
