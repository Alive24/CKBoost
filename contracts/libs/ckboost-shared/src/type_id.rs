use crate::error::Error;
use alloc::vec::Vec;
use blake2b_ref::Blake2bBuilder;
use ckb_std::{
    ckb_constants::Source,
    debug,
    error::SysError,
    high_level::{load_cell_type_hash, load_input, load_script, load_script_hash},
    syscalls::load_cell,
};
use molecule::prelude::Entity;

fn has_type_id_cell(index: usize, source: Source) -> bool {
    let mut buf = Vec::new();
    match load_cell(&mut buf, 0, index, source) {
        Ok(_) => true,
        Err(e) => {
            // just confirm cell presence, no data needed
            if let SysError::LengthNotEnough(_) = e {
                return true;
            }
            debug!("load cell err: {:?}", e);
            false
        }
    }
}

fn locate_first_type_id_output_index() -> Result<usize, Error> {
    let current_script_hash = load_script_hash()?;

    let mut i = 0;
    loop {
        let type_hash = load_cell_type_hash(i, Source::Output)?;

        if type_hash == Some(current_script_hash) {
            break;
        }
        i += 1
    }
    Ok(i)
}

/// Calculate type ID from a cell input and output index
/// This is used for both validation and testing
pub fn calculate_type_id(input: &[u8], output_index: usize) -> [u8; 32] {
    let mut blake2b = Blake2bBuilder::new(32)
        .personal(b"ckb-default-hash")
        .build();
    blake2b.update(input);
    blake2b.update(&(output_index as u64).to_le_bytes());
    let mut ret = [0; 32];
    blake2b.finalize(&mut ret);
    ret
}

/// Given a 32-byte type id, this function validates if
/// current transaction confronts to the type ID rules.
pub fn validate_type_id(type_id: [u8; 32]) -> Result<(), Error> {
    if has_type_id_cell(1, Source::GroupInput) || has_type_id_cell(1, Source::GroupOutput) {
        debug!("There can only be at most one input and at most one output type ID cell!");
        return Err(Error::InvalidTypeIDCellNum);
    }

    if !has_type_id_cell(0, Source::GroupInput) {
        // We are creating a new type ID cell here. Additional checkings are needed to ensure the type ID is legit.
        let index = locate_first_type_id_output_index()?;

        // The type ID is calculated as the blake2b (with CKB's personalization) of
        // the first CellInput in current transaction, and the created output cell
        // index(in 64-bit little endian unsigned integer).
        let input = load_input(0, Source::Input)?;
        let calculated_type_id = calculate_type_id(input.as_slice(), index);

        if calculated_type_id != type_id {
            debug!("Invalid type ID!");
            debug!("Calculated type ID: {:x?}", calculated_type_id);
            debug!("Expected type ID: {:x?}", type_id);
            return Err(Error::TypeIDNotMatch);
        }
    }
    Ok(())
}

/// Loading type ID from current script args, type_id must be at least 32 byte
/// long.
pub fn load_type_id_from_script_args(offset: usize) -> Result<[u8; 32], Error> {
    let script = load_script()?;
    let args = script.as_reader().args();
    if offset + 32 > args.raw_data().len() {
        debug!("Length of type id is incorrect!");
        return Err(Error::LengthNotEnough);
    }
    let mut ret = [0; 32];
    ret.copy_from_slice(&args.raw_data()[offset..offset + 32]);
    Ok(ret)
}


pub fn check_type_id() -> Result<(), Error> {
    let type_id = load_type_id_from_script_args(0)?;
    validate_type_id(type_id)?;
    Ok(())
}
