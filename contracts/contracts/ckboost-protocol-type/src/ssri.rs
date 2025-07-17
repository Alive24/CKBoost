use ckboost_shared::{cell_collector::RuleBasedClassifier, transaction_context::TransactionContext, types::{Byte32, ProtocolData, TippingProposalData}, Error};

#[allow(dead_code)]
pub trait CKBoostProtocol {
    fn update_protocol(
        protocol_type_hash: Option<Byte32>,
        protocol_data: ProtocolData,
    ) -> Result<(), Error>;
    fn verify_update_protocol(context: &TransactionContext<RuleBasedClassifier>) -> Result<(), Error>;

    fn update_tipping_proposal(
        protocol_type_hash: Byte32,
        tipping_proposal_data: TippingProposalData,
    ) -> Result<(), Error>;
    fn verify_update_tipping_proposal(context: &TransactionContext<RuleBasedClassifier>) -> Result<(), Error>;
}
