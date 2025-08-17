use ckb_std::{
    ckb_constants::Source,
    ckb_types::{bytes::Bytes, prelude::*},
    debug,
    high_level::{
        load_cell_data, load_cell_type_hash, load_script, load_input, QueryIter,
    },
};
use ckboost_shared::{Error, types::ConnectedTypeID};
use core::result::Result;

/// Check if this is a minting operation by comparing input and output amounts
pub fn is_minting_operation() -> Result<bool, Error> {
    // Calculate total input UDT amount
    let mut input_amount: u128 = 0;
    let udt_script = load_script().map_err(|_| Error::ItemMissing)?;
    let script_hash = udt_script.calc_script_hash();
    
    // Iterate through all inputs to find UDT cells
    let input_udt_cells = QueryIter::new(load_cell_type_hash, Source::Input)
        .enumerate()
        .filter_map(|(index, type_hash)| {
            type_hash.and_then(|h| {
                if h.as_slice() == script_hash.as_slice() {
                    load_cell_data(index, Source::Input).ok()
                } else {
                    None
                }
            })
        });
    
    for data in input_udt_cells {
        if data.len() >= 16 {
            let mut amount_bytes = [0u8; 16];
            amount_bytes.copy_from_slice(&data[0..16]);
            input_amount = input_amount.saturating_add(u128::from_le_bytes(amount_bytes));
        }
    }
    
    // Calculate total output UDT amount
    let mut output_amount: u128 = 0;
    let output_udt_cells = QueryIter::new(load_cell_type_hash, Source::Output)
        .enumerate()
        .filter_map(|(index, type_hash)| {
            type_hash.and_then(|h| {
                if h.as_slice() == script_hash.as_slice() {
                    load_cell_data(index, Source::Output).ok()
                } else {
                    None
                }
            })
        });
    
    for data in output_udt_cells {
        if data.len() >= 16 {
            let mut amount_bytes = [0u8; 16];
            amount_bytes.copy_from_slice(&data[0..16]);
            output_amount = output_amount.saturating_add(u128::from_le_bytes(amount_bytes));
        }
    }
    
    debug!("UDT amounts - Input: {}, Output: {}", input_amount, output_amount);
    
    // If output > input, it's a minting operation
    Ok(output_amount > input_amount)
}

/// Validate protocol owner mode for minting operations
/// Requires:
/// 1. Protocol cell in CellDeps
/// 2. Campaign cell in inputs with valid ConnectedTypeID
/// 3. User cells in inputs with valid ConnectedTypeID
/// 4. Campaign admin signature (validated by lock script)
pub fn validate_protocol_owner_mode(protocol_type_hash: &[u8]) -> Result<(), Error> {
    debug!("Validating protocol owner mode");
    
    // 1. Verify protocol cell exists in CellDeps
    if !find_protocol_cell_in_deps(protocol_type_hash)? {
        debug!("Protocol cell not found in CellDeps");
        return Err(Error::InvalidProtocolReference);
    }
    
    // 2. Find campaign cell in inputs and validate its ConnectedTypeID
    let campaign_found = find_and_validate_campaign_cell(protocol_type_hash)?;
    if !campaign_found {
        debug!("No valid campaign cell found in inputs");
        return Err(Error::InvalidCampaignCell);
    }
    
    // 3. Find user cells in inputs and validate their ConnectedTypeIDs
    let users_found = find_and_validate_user_cells(protocol_type_hash)?;
    if !users_found {
        debug!("No valid user cells found in inputs");
        return Err(Error::InvalidUserCell);
    }
    
    // 4. Campaign admin signature is validated by the campaign cell's lock script
    // The fact that the campaign cell is spent means the admin has signed
    
    debug!("Protocol owner mode validation successful");
    Ok(())
}

/// Find protocol cell in CellDeps
fn find_protocol_cell_in_deps(protocol_type_hash: &[u8]) -> Result<bool, Error> {
    let mut index = 0;
    loop {
        match load_cell_type_hash(index, Source::CellDep) {
            Ok(Some(type_hash)) if type_hash.as_slice() == protocol_type_hash => {
                debug!("Found protocol cell in CellDeps at index {}", index);
                return Ok(true);
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            _ => {}
        }
        index += 1;
    }
    
    Ok(false)
}

/// Find and validate campaign cell in inputs
fn find_and_validate_campaign_cell(protocol_type_hash: &[u8]) -> Result<bool, Error> {
    let mut index = 0;
    loop {
        match load_input(index, Source::Input) {
            Ok(_input) => {
                // Try to load the cell's type script
                if let Ok(Some(_type_hash)) = load_cell_type_hash(index, Source::Input) {
                    // Load the cell data to check if it looks like campaign data
                    if let Ok(data) = load_cell_data(index, Source::Input) {
                        // Campaign cells have substantial data (at least a few hundred bytes)
                        if data.len() > 100 {
                            // Check the ConnectedTypeID in the type script args
                            if validate_connected_type_id(index, Source::Input, protocol_type_hash)? {
                                debug!("Found valid campaign cell at index {}", index);
                                return Ok(true);
                            }
                        }
                    }
                }
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => {}
        }
        index += 1;
    }
    
    Ok(false)
}

/// Find and validate user cells in inputs
fn find_and_validate_user_cells(protocol_type_hash: &[u8]) -> Result<bool, Error> {
    let mut found_any = false;
    let mut index = 0;
    
    loop {
        match load_input(index, Source::Input) {
            Ok(_) => {
                // Check if this is a user cell by validating ConnectedTypeID
                if let Ok(Some(_type_hash)) = load_cell_type_hash(index, Source::Input) {
                    // Load cell data to distinguish user cells
                    if let Ok(data) = load_cell_data(index, Source::Input) {
                        // User cells have moderate data size (UserData structure)
                        if data.len() > 50 && data.len() < 10000 {
                            if validate_connected_type_id(index, Source::Input, protocol_type_hash)? {
                                debug!("Found valid user cell at index {}", index);
                                found_any = true;
                            }
                        }
                    }
                }
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            Err(_) => {}
        }
        index += 1;
    }
    
    Ok(found_any)
}

/// Validate ConnectedTypeID in a cell's type script args
fn validate_connected_type_id(index: usize, source: Source, protocol_type_hash: &[u8]) -> Result<bool, Error> {
    // Load the cell's type script
    let type_script = match ckb_std::high_level::load_cell_type(index, source).map_err(|_| Error::ItemMissing)? {
        Some(script) => script,
        None => return Ok(false),
    };
    
    let args: Bytes = type_script.args().unpack();
    
    // ConnectedTypeID is 76 bytes (32 bytes type_id + 32 bytes connected_key + padding)
    if args.len() != 76 {
        return Ok(false);
    }
    
    // Parse ConnectedTypeID
    match ConnectedTypeID::from_slice(&args) {
        Ok(connected_type_id) => {
            // Check if connected_key matches protocol type hash
            let connected_key = connected_type_id.connected_key();
            let connected_key_slice = connected_key.raw_data();
            if connected_key_slice.as_ref() == protocol_type_hash {
                return Ok(true);
            }
        }
        Err(_) => {
            debug!("Failed to parse ConnectedTypeID");
        }
    }
    
    Ok(false)
}

/// Validate standard UDT rules (balance checks)
pub fn validate_udt_rules() -> Result<(), Error> {
    // Standard UDT validation: sum of inputs >= sum of outputs (except for minting)
    let mut input_amount: u128 = 0;
    let mut output_amount: u128 = 0;
    let udt_script = load_script().map_err(|_| Error::ItemMissing)?;
    
    // Calculate input amount
    let mut index = 0;
    loop {
        match load_cell_type_hash(index, Source::Input) {
            Ok(Some(type_hash)) => {
                let script_hash = udt_script.calc_script_hash();
                if type_hash.as_slice() == script_hash.as_slice() {
                    let data = load_cell_data(index, Source::Input).map_err(|_| Error::ItemMissing)?;
                    if data.len() >= 16 {
                        let mut amount_bytes = [0u8; 16];
                        amount_bytes.copy_from_slice(&data[0..16]);
                        input_amount = input_amount.saturating_add(u128::from_le_bytes(amount_bytes));
                    }
                }
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            _ => {}
        }
        index += 1;
    }
    
    // Calculate output amount
    index = 0;
    loop {
        match load_cell_type_hash(index, Source::Output) {
            Ok(Some(type_hash)) => {
                let script_hash = udt_script.calc_script_hash();
                if type_hash.as_slice() == script_hash.as_slice() {
                    let data = load_cell_data(index, Source::Output).map_err(|_| Error::ItemMissing)?;
                    if data.len() >= 16 {
                        let mut amount_bytes = [0u8; 16];
                        amount_bytes.copy_from_slice(&data[0..16]);
                        output_amount = output_amount.saturating_add(u128::from_le_bytes(amount_bytes));
                    }
                }
            }
            Err(ckb_std::error::SysError::IndexOutOfBound) => break,
            _ => {}
        }
        index += 1;
    }
    
    // For minting, the check is already done in validate_protocol_owner_mode
    // For transfers, input must be >= output
    if !is_minting_operation()? && input_amount < output_amount {
        debug!("UDT rule violation: input {} < output {}", input_amount, output_amount);
        return Err(Error::InvalidUDTAmount);
    }
    
    Ok(())
}