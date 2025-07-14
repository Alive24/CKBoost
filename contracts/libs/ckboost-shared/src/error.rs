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
    
    // Cell collection errors
    DetectedUnidentifiedCells,
    
    // ckb_deterministic compatibility errors
    DataError,
    RecipeError,
    SysError(i8),
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

impl Error {
    /// Convert Error to i8 error code for contract exit codes
    pub fn as_error_code(self) -> i8 {
        match self {
            Error::IndexOutOfBound => 1,
            Error::ItemMissing => 2,
            Error::LengthNotEnough => 3,
            Error::Encoding => 4,
            Error::SpawnExceededMaxContentLength => 5,
            Error::SpawnWrongMemoryLimit => 6,
            Error::SpawnExceededMaxPeakMemory => 7,
            Error::Utf8Error => 8,
            Error::SSRIMethodsNotFound => 9,
            Error::SSRIMethodsArgsInvalid => 10,
            Error::SSRIMethodsNotImplemented => 11,
            Error::SSRIMethodRequireHigherLevel => 12,
            Error::InvalidVmVersion => 13,
            Error::InvalidTypeIDCellNum => 14,
            Error::TypeIDNotMatch => 15,
            Error::MoleculeVerificationError => 16,
            Error::SerdeMoleculeErrorWithMessage => 17,
            Error::MismatchedLength => 18,
            Error::SerdeMoleculeLengthNotEnough => 19,
            Error::Unimplemented => 20,
            Error::AssembleFixvec => 21,
            Error::InvalidFixvec => 22,
            Error::MismatchedTableFieldCount => 23,
            Error::Overflow => 24,
            Error::InvalidArray => 25,
            Error::InvalidStructField => 26,
            Error::InvalidMap => 27,
            Error::InvalidTable => 28,
            Error::InvalidTableLength => 29,
            Error::InvalidTableHeader => 30,
            Error::InvalidTableCount => 31,
            Error::MixTableAndStruct => 32,
            Error::InvalidChar => 33,
            Error::InvalidCampaignData => 34,
            Error::InvalidCampaignState => 35,
            Error::InvalidCampaignCreator => 36,
            Error::InvalidCampaignFunding => 37,
            Error::InvalidCampaignTimestamp => 38,
            Error::InvalidQuestData => 39,
            Error::InvalidQuestCreator => 40,
            Error::InvalidQuestCampaign => 41,
            Error::InvalidQuestReward => 42,
            Error::InvalidQuestStatus => 43,
            Error::InvalidProtocolData => 44,
            Error::InvalidProtocolState => 45,
            Error::InvalidProtocolVersion => 46,
            Error::CampaignNotFound => 47,
            Error::CampaignNotActive => 48,
            Error::InsufficientFunding => 49,
            Error::QuestLimitExceeded => 50,
            Error::UnauthorizedOperation => 51,
            Error::InvalidTransaction => 52,
            Error::ArgumentNotFound => 53,
            Error::DetectedUnidentifiedCells => 54,
            Error::DataError => 55,
            Error::RecipeError => 56,
            Error::SysError(code) => code,
        }
    }
}

pub type Result<T> = core::result::Result<T, Error>;