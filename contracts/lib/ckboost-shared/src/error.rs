use ckb_ssri_std::SSRIError;
use ckb_std::error::SysError;

/// Error codes for CKBoost contracts
#[repr(i8)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Error {
    // * CKB Error
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough,
    Encoding,
    SpawnExceededMaxContentLength,
    SpawnWrongMemoryLimit,
    SpawnExceededMaxPeakMemory,

    // * Rust Error
    Utf8Error,

    // * SSRI Error
    SSRIMethodsNotFound,
    SSRIMethodsArgsInvalid,
    SSRIMethodsNotImplemented,
    SSRIMethodRequireHigherLevel,
    InvalidVmVersion,

    // * Type ID Error
    InvalidTypeIDCellNum,
    TypeIDNotMatch,

    // * Molecule Error
    MoleculeVerificationError,

    // * Serde Molecule Error
    SerdeMoleculeErrorWithMessage,
    /// Contains a general error message as a string.
    /// Occurs when the data length is incorrect while parsing a number or molecule header.
    MismatchedLength,
    /// Occurs when the data length is insufficient while parsing a number or molecule header.
    SerdeMoleculeLengthNotEnough,
    /// Indicates that the method or type is not implemented. Not all types in Rust can be serialized.
    Unimplemented,
    /// Occurs when assembling a molecule fixvec, and the size of each element is inconsistent.
    AssembleFixvec,
    /// Occurs when the header or size is incorrect while parsing a molecule fixvec.
    InvalidFixvec,
    /// Occurs when the field count is mismatched while parsing a molecule table.
    MismatchedTableFieldCount,
    /// Occurs when an overflow happens while parsing a molecule header.
    Overflow,
    /// Indicates an error encountered while parsing a molecule array.
    InvalidArray,
    /// Indicates that non-fixed size fields are not allowed in a molecule struct, e.g., `Option`, `Vec`, `DynVec`, `enum`.
    InvalidStructField,
    /// Indicates that a map should have exactly two fields: a key and a value.
    InvalidMap,
    /// Indicates that the table header is invalid or malformed.
    InvalidTable,
    /// Indicates that the table length is invalid or malformed.
    InvalidTableLength,
    /// Indicates that the table header is invalid or malformed.
    InvalidTableHeader,
    /// Indicates that the field count in serialization is mismatched.
    InvalidTableCount,
    /// Indicates that non-fixed size fields are not allowed in a molecule struct, e.g., `Option`, `Vec`, `DynVec`, `enum`.
    MixTableAndStruct,
    InvalidChar,
    
    // Campaign validation errors
    InvalidCampaignData,
    InvalidCampaignState,
    InvalidCampaignCreator,
    InvalidCampaignFunding,
    InvalidCampaignTimestamp,
    
    // Quest validation errors
    InvalidQuestData,
    InvalidQuestCreator,
    InvalidQuestCampaign,
    InvalidQuestReward,
    InvalidQuestStatus,
    
    // Protocol validation errors
    InvalidProtocolData,
    InvalidProtocolState,
    InvalidProtocolVersion,
    
    // Operation errors
    CampaignNotFound,
    CampaignNotActive,
    InsufficientFunding,
    QuestLimitExceeded,
    UnauthorizedOperation,
    InvalidTransaction,
    
    // SSRI parsing errors
    ArgumentNotFound,
}

impl From<SysError> for Error {
    fn from(err: SysError) -> Self {
        match err {
            SysError::IndexOutOfBound => Error::IndexOutOfBound,
            SysError::ItemMissing => Error::ItemMissing,
            SysError::LengthNotEnough(_) => Error::LengthNotEnough,
            SysError::Encoding => Error::Encoding,
            _ => Error::InvalidTransaction,
        }
    }
}

impl From<SSRIError> for Error {
    fn from(err: SSRIError) -> Self {
        match err {
            SSRIError::SSRIMethodsNotFound => Self::SSRIMethodsArgsInvalid,
            SSRIError::SSRIMethodsArgsInvalid => Self::SSRIMethodsNotImplemented,
            SSRIError::SSRIMethodsNotImplemented => Self::SSRIMethodsNotImplemented,
            SSRIError::SSRIMethodRequireHigherLevel => Self::SSRIMethodRequireHigherLevel,
            SSRIError::InvalidVmVersion => Self::InvalidVmVersion,
        }
    }
}

pub type Result<T> = core::result::Result<T, Error>;