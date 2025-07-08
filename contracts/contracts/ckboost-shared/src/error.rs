use ckb_std::error::SysError;

/// Error codes for CKBoost contracts
#[repr(i8)]
#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Error {
    IndexOutOfBound = 1,
    ItemMissing = 2,
    LengthNotEnough = 3,
    Encoding = 4,
    
    // Campaign validation errors
    InvalidCampaignData = 10,
    InvalidCampaignState = 11,
    InvalidCampaignCreator = 12,
    InvalidCampaignFunding = 13,
    InvalidCampaignTimestamp = 14,
    
    // Quest validation errors
    InvalidQuestData = 20,
    InvalidQuestCreator = 21,
    InvalidQuestCampaign = 22,
    InvalidQuestReward = 23,
    InvalidQuestStatus = 24,
    
    // Protocol validation errors
    InvalidProtocolData = 25,
    InvalidProtocolState = 26,
    InvalidProtocolVersion = 27,
    
    // Operation errors
    CampaignNotFound = 30,
    CampaignNotActive = 31,
    InsufficientFunding = 32,
    QuestLimitExceeded = 33,
    UnauthorizedOperation = 34,
    InvalidTransaction = 35,
    
    // SSRI errors
    SSRIMethodsNotFound = 40,
    SSRIMethodsArgsInvalid = 41,
    InvalidSSRIMethod = 42,
    InvalidSSRIParams = 43,
    SSRIMethodNotSupported = 44,
    SSRISerializationError = 45,
    MoleculeVerificationError = 46,
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

// SSRI error type conversions (conditional compilation for when SSRI is available)
#[cfg(feature = "ssri")]
impl From<ckb_ssri_std::Error> for Error {
    fn from(err: ckb_ssri_std::Error) -> Self {
        match err {
            ckb_ssri_std::Error::MethodNotFound => Error::SSRIMethodsNotFound,
            ckb_ssri_std::Error::InvalidArgs => Error::SSRIMethodsArgsInvalid,
            ckb_ssri_std::Error::SerializationError => Error::SSRISerializationError,
            _ => Error::SSRIMethodNotSupported,
        }
    }
}

pub type Result<T> = core::result::Result<T, Error>;