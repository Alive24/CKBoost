//! CKBoost shared types
//! 
//! This module provides a clean interface to the generated Molecule types
//! for CKBoost campaigns, quests, and protocol data.

// Re-export all generated types from the generated module
pub use crate::generated::*;

// Organize exports by functional area for better discoverability

/// Basic blockchain types (CKB primitives)
pub mod blockchain {
    pub use crate::generated::{
        // Basic types
        Uint8, Uint32, Uint64, Uint128, Byte32, Uint256,
        Bytes, BytesOpt, BytesVec, Byte32Vec, Byte32Opt,
        
        // CKB core types
        Script, ScriptOpt, ScriptVec,
        OutPoint, CellInput, CellOutput, CellDep,
        RawTransaction, Transaction,
        RawHeader, Header, Block, BlockV1,
        CellbaseWitness, WitnessArgs,
        
        // Vectors
        UncleBlockVec, TransactionVec, ProposalShortIdVec,
        CellDepVec, CellInputVec, CellOutputVec,
        
        // Readers and Builders
        ScriptReader, ScriptBuilder,
        CellOutputReader, CellOutputBuilder,
        // Add other readers/builders as needed
    };
}

/// Campaign and quest related types
pub mod campaign {
    pub use crate::generated::{
        UDTFunding, UDTFundingVec,
        AssetList, AssetListVec,
        QuestSubTaskData, QuestSubTaskDataVec,
        CompletionRecord, CompletionRecordVec,
        QuestData, QuestDataVec,
        CampaignMetadata, CampaignData, CampaignDataVec,
        
        // Readers and Builders
        UDTFundingReader, UDTFundingBuilder,
        AssetListReader, AssetListBuilder,
        QuestDataReader, QuestDataBuilder,
        CampaignDataReader, CampaignDataBuilder,
        // Add other readers/builders as needed
    };
}

/// Protocol governance and administration types
pub mod protocol {
    pub use crate::generated::{
        UserVerificationData,
        TippingProposalMetadata, TippingProposalData, TippingProposalDataVec,
        ProtocolData,
        
        // Readers and Builders
        UserVerificationDataReader, UserVerificationDataBuilder,
        TippingProposalDataReader, TippingProposalDataBuilder,
        ProtocolDataReader, ProtocolDataBuilder,
        // Add other readers/builders as needed
    };
}