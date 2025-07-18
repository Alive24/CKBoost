use crate::Loader;
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::TransactionBuilder,
        packed::*,
        prelude::*,
    },
    context::Context,
};
use ckboost_shared::type_id::calculate_type_id;

#[test]
fn test_protocol_type_id_creation() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create a proper input cell (without type script - simulating new creation)
    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .build(),
        Bytes::new(),
    );
    
    let first_input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();
    
    // Calculate type ID for first output (index 0)
    let type_id = calculate_type_id(first_input.as_bytes().as_ref(), 0);
    
    // Create type script with the calculated type ID
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build script");
    
    // Create output cell with type script
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Build transaction
    let tx = TransactionBuilder::default()
        .input(first_input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should pass for new type ID creation
    let cycles = context
        .verify_tx(&tx, 10_000_000)
        .expect("pass verification");
    println!("Type ID creation cycles: {}", cycles);
}

#[test]
fn test_protocol_type_id_validation_existing_cell() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Use a fixed type ID for testing existing cell validation
    let type_id = [42u8; 32];
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build script");
    
    // Create input cell WITH type script (simulating existing protocol cell)
    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .type_(Some(type_script.clone()).pack())
            .build(),
        Bytes::new(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();
    
    // Create output cell with same type script
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Build transaction
    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should pass for existing cell validation
    let cycles = context
        .verify_tx(&tx, 10_000_000)
        .expect("pass verification");
    println!("Existing cell validation cycles: {}", cycles);
}

#[test]
fn test_protocol_type_id_invalid_type_id() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create a proper input cell (without type script - simulating new creation)
    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .build(),
        Bytes::new(),
    );
    
    let first_input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();
    
    // Use WRONG type ID (not calculated correctly)
    let wrong_type_id = [99u8; 32];
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(wrong_type_id.to_vec()))
        .expect("build script");
    
    // Create output cell with wrong type script
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Build transaction
    let tx = TransactionBuilder::default()
        .input(first_input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should fail with TypeIDNotMatch error
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Invalid type ID test failed as expected: {:?}", result.err());
}

#[test]
fn test_protocol_type_id_multiple_cells_error() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    let type_id = [42u8; 32];
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build script");
    
    // Create two input cells with same type script (violating singleton pattern)
    let input_out_point1 = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .type_(Some(type_script.clone()).pack())
            .build(),
        Bytes::new(),
    );
    
    let input_out_point2 = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .type_(Some(type_script.clone()).pack())
            .build(),
        Bytes::new(),
    );
    
    // Create output cell
    let output = CellOutput::new_builder()
        .capacity(2000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Build transaction with multiple inputs of same type
    let tx = TransactionBuilder::default()
        .input(CellInput::new_builder().previous_output(input_out_point1).build())
        .input(CellInput::new_builder().previous_output(input_out_point2).build())
        .output(output)
        .output_data(Bytes::new().pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should fail with InvalidTypeIDCellNum error
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Multiple cells test failed as expected: {:?}", result.err());
}

#[test]
fn test_protocol_type_id_insufficient_args() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create type script with insufficient args (less than 32 bytes)
    let insufficient_args = vec![1u8; 16]; // Only 16 bytes instead of 32
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(insufficient_args))
        .expect("build script");
    
    // Create input cell
    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .build(),
        Bytes::new(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();
    
    // Create output cell with insufficient args
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Build transaction
    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(Bytes::new().pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should fail with LengthNotEnough error
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Insufficient args test failed as expected: {:?}", result.err());
}

#[test]
fn test_protocol_ssri_update_protocol() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create a proper input cell (without type script - simulating new creation)
    let input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(always_success_lock_script.clone())
            .build(),
        Bytes::new(),
    );
    
    let first_input = CellInput::new_builder()
        .previous_output(input_out_point)
        .build();
    
    // Calculate type ID for first output (index 0)
    let type_id = calculate_type_id(first_input.as_bytes().as_ref(), 0);
    
    // Create type script with the calculated type ID
    let type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build script");
    
    // Create output cell with type script
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(always_success_lock_script)
        .type_(Some(type_script).pack())
        .build();
    
    // Create some protocol data for the output
    let protocol_data = Bytes::from(vec![1, 2, 3, 4]); // Mock protocol data
    
    // Build transaction
    let tx = TransactionBuilder::default()
        .input(first_input)
        .output(output)
        .output_data(protocol_data.pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Verify transaction - should pass for SSRI update_protocol
    let cycles = context
        .verify_tx(&tx, 10_000_000)
        .expect("pass verification");
    println!("SSRI update_protocol cycles: {}", cycles);
} 