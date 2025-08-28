use alloc::ffi::CString;
use ckb_std::{ckb_types::core::ScriptHashType, high_level::decode_hex};

#[derive(Debug)]
pub struct ScriptInfo {
    pub code_hash: [u8; 32],
    pub hash_type: ScriptHashType,
}

pub fn get_known_script(identifier: &str) -> ScriptInfo {
    match identifier {
        "xudt" => ScriptInfo {
            code_hash: decode_hex(
                &CString::new("0x25c29dc317811a6f6f3985a7a9ebc4838bd388d19d0feeecf0bcd60f6c0975bb")
                    .unwrap()
                    .as_c_str()[2..],
            )
            .unwrap()
            .try_into()
            .unwrap(),
            hash_type: ScriptHashType::Data1,
        },
        "spore" => ScriptInfo {
            code_hash: decode_hex(
                &CString::new("0x4a4dce1df3dffff7f8b2cd7dff7303df3b6150c9788cb75dcf6747247132b9f5")
                    .unwrap()
                    .as_c_str()[2..],
            )
            .unwrap()
            .try_into()
            .unwrap(),
            hash_type: ScriptHashType::Data1,
        },
        "type_id" => ScriptInfo {
            code_hash: decode_hex(
                &CString::new("0x00000000000000000000000000000000000000000000000000545950455f4944")
                    .unwrap()
                    .as_c_str()[2..],
            )
            .unwrap()
            .try_into()
            .unwrap(),
            hash_type: ScriptHashType::Type,
        },
        _ => panic!("Unknown known script: {}", identifier),
    }
}
