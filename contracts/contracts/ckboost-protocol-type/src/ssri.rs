use ckboost_shared::{types::{ProtocolData, TippingProposalData}, Error};

pub trait CKBoostProtocol {
    fn update_protocol(
        protocol_type_hash: Option<Byte32>,
        protocol_data: ProtocolData,
    ) -> Result<(), Error>;
    fn verify_update_protocol() -> Result<(), Error>;

    fn update_tipping_proposal(
        protocol_type_hash: Byte32,
        tipping_proposal_data: TippingProposalData,
    ) -> Result<(), Error>;
    fn verify_update_tipping_proposal() -> Result<(), Error>;
}
