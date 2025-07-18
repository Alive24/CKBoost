/// Integration tests for CKBoost transaction context with ckb_deterministic framework
/// Tests the complete transaction validation flow including:
/// - Transaction context creation
/// - Cell classification  
/// - Transaction recipe parsing (used by fallback validation)
/// - Business logic validation through fallback methods
/// 
/// NOTE: The contract uses two validation approaches:
/// 1. SSRI validation - Not implemented yet
/// 2. Fallback validation - Uses TransactionRecipe from ckb_deterministic
/// 
/// These tests focus on the fallback validation which is currently active.

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
use ckboost_shared::{
    generated::ckboost::{
        ProtocolDataBuilder, ProtocolConfigBuilder, 
        ScriptCodeHashesBuilder, Byte32Vec, TippingConfigBuilder,
        CampaignDataVec, TippingProposalDataVec, EndorserInfoVec,
        Uint128Vec, Byte32, Uint64,
    },
};

/// Helper to create protocol data with admin lock and optional tipping proposal  
fn create_protocol_data(admin_lock_hash: [u8; 32], _tipping_proposal: Option<Vec<u8>>) -> Bytes {
    // Create ProtocolConfig with admin lock hash
    let admin_lock_hash_vec = Byte32Vec::new_builder()
        .push(Byte32::from(admin_lock_hash))
        .build();
    
    let script_code_hashes = ScriptCodeHashesBuilder::default()
        .ckb_boost_protocol_type_code_hash(Byte32::from([0u8; 32]))
        .ckb_boost_protocol_lock_code_hash(Byte32::from([0u8; 32]))
        .ckb_boost_campaign_type_code_hash(Byte32::from([0u8; 32]))
        .ckb_boost_campaign_lock_code_hash(Byte32::from([0u8; 32]))
        .ckb_boost_user_type_code_hash(Byte32::from([0u8; 32]))
        .accepted_udt_type_code_hashes(Byte32Vec::default())
        .accepted_dob_type_code_hashes(Byte32Vec::default())
        .build();
    
    let protocol_config = ProtocolConfigBuilder::default()
        .admin_lock_hash_vec(admin_lock_hash_vec)
        .script_code_hashes(script_code_hashes)
        .build();
    
    // Create TippingConfig
    let tipping_config = TippingConfigBuilder::default()
        .approval_requirement_thresholds(Uint128Vec::default())
        .expiration_duration(Uint64::from_slice(&0u64.to_le_bytes()).unwrap())
        .build();
    
    // Build ProtocolData
    let protocol_data = ProtocolDataBuilder::default()
        .campaigns_approved(CampaignDataVec::default())
        .tipping_proposals(TippingProposalDataVec::default())
        .tipping_config(tipping_config)
        .endorsers_whitelist(EndorserInfoVec::default())
        .last_updated(Uint64::from_slice(&0u64.to_le_bytes()).unwrap())
        .protocol_config(protocol_config)
        .build();
    
    protocol_data.as_bytes()
}

/// Helper to create transaction recipe witness format
fn create_recipe_witness(method_path: &str, args: Vec<&[u8]>) -> Bytes {
    use ckb_deterministic::generated::{TransactionRecipe, Bytes as DeterministicBytes, BytesVec};
    
    // Build method_path as Bytes
    let method_path_bytes = DeterministicBytes::from(method_path.as_bytes().to_vec());
    
    // Build arguments as BytesVec
    let mut arguments = Vec::new();
    for arg in args {
        arguments.push(DeterministicBytes::from(arg.to_vec()));
    }
    let arguments_vec = BytesVec::from(arguments);
    
    // Build TransactionRecipe with the proper builder API
    let recipe = TransactionRecipe::new_builder()
        .method_path(method_path_bytes)
        .arguments(arguments_vec)
        .build();
    
    Bytes::from(recipe.as_bytes())
}

#[test]
#[ignore = "TransactionRecipe must be in last witness position - test framework limitation"]
fn test_update_protocol_with_transaction_context() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script for testing
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create admin lock (using always-success for simplicity)
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Step 1: Create initial protocol cell
    let initial_input_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .build(),
        Bytes::new(),
    );
    
    let initial_input = CellInput::new_builder()
        .previous_output(initial_input_out_point)
        .build();
    
    // Calculate type ID for protocol cell
    let type_id = ckboost_shared::type_id::calculate_type_id(
        initial_input.as_bytes().as_ref(), 
        0
    );
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    // Create initial protocol data
    let initial_protocol_data = create_protocol_data(admin_lock_hash_array, None);
    
    let protocol_cell_output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(admin_lock.clone())
        .type_(Some(protocol_type_script.clone()).pack())
        .build();
    
    // Create transaction recipe witness for initial creation
    let creation_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![
        b"initial_protocol_config"
    ]);
    
    let creation_tx = TransactionBuilder::default()
        .input(initial_input)
        .output(protocol_cell_output.clone())
        .output_data(initial_protocol_data.pack())
        .witness(creation_witness.pack())
        .build();
    
    let creation_tx = context.complete_tx(creation_tx);
    
    // Verify initial creation
    let cycles = context
        .verify_tx(&creation_tx, 10_000_000)
        .expect("protocol creation should pass");
    println!("Protocol creation cycles: {}", cycles);
    
    // Step 2: Update protocol cell
    // Create the protocol cell in context (simulating it was created by the previous transaction)
    let protocol_cell_out_point = context.create_cell(
        protocol_cell_output.clone(),
        initial_protocol_data.clone(),
    );
    
    let update_input = CellInput::new_builder()
        .previous_output(protocol_cell_out_point)
        .build();
    
    // Create updated protocol data with tipping proposal
    let updated_protocol_data = create_protocol_data(
        admin_lock_hash_array,
        Some(b"new_tipping_proposal".to_vec())
    );
    
    let updated_protocol_output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(admin_lock.clone()) // Keep same admin lock
        .type_(Some(protocol_type_script.clone()).pack()) // Keep same type script
        .build();
    
    // Create transaction recipe witness for update
    let update_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![
        b"updated_protocol_config"
    ]);
    
    let update_tx = TransactionBuilder::default()
        .input(update_input)
        .output(updated_protocol_output)
        .output_data(updated_protocol_data.pack())
        .witness(update_witness.pack())
        .build();
    
    let update_tx = context.complete_tx(update_tx);
    
    // Verify update transaction
    let cycles = context
        .verify_tx(&update_tx, 10_000_000)
        .expect("protocol update should pass");
    println!("Protocol update cycles: {}", cycles);
}

// These tests are marked as ignored because the fallback validation
// expects the witness to be in the LAST position of all witnesses
#[test]
#[ignore]
fn test_update_protocol_invalid_admin_lock_change() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    // Create admin lock
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Create a different lock for the attack
    let different_lock = context
        .build_script(&always_success_out_point, Bytes::from(vec![1, 2, 3]))
        .expect("build different lock script");
    
    // Create protocol cell with admin lock
    let protocol_data = create_protocol_data(admin_lock_hash_array, None);
    let type_id = [42u8; 32]; // Fixed type ID for testing
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    let protocol_cell_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script.clone()).pack())
            .build(),
        protocol_data.clone(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(protocol_cell_out_point)
        .build();
    
    // Try to update with different admin lock (should fail)
    let malicious_output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(different_lock) // Different lock!
        .type_(Some(protocol_type_script).pack())
        .build();
    
    let update_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![
        b"malicious_update"
    ]);
    
    let tx = TransactionBuilder::default()
        .input(input)
        .output(malicious_output)
        .output_data(protocol_data.pack())
        .witness(update_witness.pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Should fail validation
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Admin lock change correctly rejected: {:?}", result.err());
}

#[test]
#[ignore]
fn test_update_protocol_invalid_type_script_change() {
    // Setup
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin.clone());
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Create protocol cell
    let protocol_data = create_protocol_data(admin_lock_hash_array, None);
    let type_id = [42u8; 32];
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    let protocol_cell_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script.clone()).pack())
            .build(),
        protocol_data.clone(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(protocol_cell_out_point)
        .build();
    
    // Try to change type script (should fail)
    let different_type_id = [99u8; 32];
    let different_type_script = context
        .build_script(&protocol_out_point, Bytes::from(different_type_id.to_vec()))
        .expect("build different type script");
    
    let malicious_output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(admin_lock)
        .type_(Some(different_type_script).pack()) // Different type script!
        .build();
    
    let update_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![
        b"type_script_change_attempt"
    ]);
    
    let tx = TransactionBuilder::default()
        .input(input)
        .output(malicious_output)
        .output_data(protocol_data.pack())
        .witness(update_witness.pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Should fail validation
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Type script change correctly rejected: {:?}", result.err());
}

#[test]
#[ignore = "TransactionRecipe must be in last witness position"]
fn test_update_protocol_with_complex_transaction() {
    // Test a more complex transaction with multiple cell types
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Create protocol cell
    let protocol_data = create_protocol_data(admin_lock_hash_array, None);
    let type_id = [42u8; 32];
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    let protocol_cell_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script.clone()).pack())
            .build(),
        protocol_data.clone(),
    );
    
    // Create additional cells (simple CKB cells for fees)
    let fee_cell_1 = context.create_cell(
        CellOutput::new_builder()
            .capacity(500u64.pack())
            .lock(admin_lock.clone())
            .build(),
        Bytes::new(),
    );
    
    let fee_cell_2 = context.create_cell(
        CellOutput::new_builder()
            .capacity(300u64.pack())
            .lock(admin_lock.clone())
            .build(),
        Bytes::new(),
    );
    
    // Build complex transaction with multiple inputs
    let inputs = vec![
        CellInput::new_builder().previous_output(protocol_cell_out_point).build(),
        CellInput::new_builder().previous_output(fee_cell_1).build(),
        CellInput::new_builder().previous_output(fee_cell_2).build(),
    ];
    
    // Create updated protocol data
    let updated_protocol_data = create_protocol_data(
        admin_lock_hash_array,
        Some(b"complex_update_proposal".to_vec())
    );
    
    // Outputs: updated protocol cell + change cell
    let outputs = vec![
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script).pack())
            .build(),
        CellOutput::new_builder()
            .capacity(700u64.pack()) // Change from fee cells (500 + 300 - 100 fee)
            .lock(admin_lock.clone())
            .build(),
    ];
    
    let outputs_data = vec![
        updated_protocol_data.pack(),
        Bytes::new().pack(),
    ];
    
    // Create transaction recipe witness
    let update_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![
        b"complex_transaction_update"
    ]);
    
    let mut tx_builder = TransactionBuilder::default()
        .witness(update_witness.pack());
    
    for input in inputs {
        tx_builder = tx_builder.input(input);
    }
    
    for (output, data) in outputs.into_iter().zip(outputs_data.into_iter()) {
        tx_builder = tx_builder.output(output).output_data(data);
    }
    
    let tx = tx_builder.build();
    let tx = context.complete_tx(tx);
    
    // Verify complex transaction
    let cycles = context
        .verify_tx(&tx, 10_000_000)
        .expect("complex protocol update should pass");
    println!("Complex protocol update cycles: {}", cycles);
}

#[test]
#[ignore]
fn test_invalid_recipe_method_path() {
    // Test that invalid method paths are rejected
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Create protocol cell
    let protocol_data = create_protocol_data(admin_lock_hash_array, None);
    let type_id = [42u8; 32];
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    let protocol_cell_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script.clone()).pack())
            .build(),
        protocol_data.clone(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(protocol_cell_out_point)
        .build();
    
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(admin_lock)
        .type_(Some(protocol_type_script).pack())
        .build();
    
    // Use invalid method path
    let invalid_witness = create_recipe_witness("invalid.method.path", vec![
        b"should_fail"
    ]);
    
    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(protocol_data.pack())
        .witness(invalid_witness.pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Should fail with SSRIMethodsNotImplemented error (error name still references SSRI)
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Invalid method path correctly rejected: {:?}", result.err());
}

#[test]
#[ignore]
fn test_update_protocol_missing_arguments() {
    // Test that missing required arguments are rejected
    let mut context = Context::default();
    let protocol_bin: Bytes = Loader::default().load_binary("ckboost-protocol-type");
    let protocol_out_point = context.deploy_cell(protocol_bin);
    
    // Deploy always-success lock script
    let always_success_out_point = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let always_success_lock_script = context
        .build_script(&always_success_out_point, Default::default())
        .expect("build always-success lock script");
    
    let admin_lock = always_success_lock_script.clone();
    let admin_lock_hash = admin_lock.calc_script_hash().raw_data().to_vec();
    let admin_lock_hash_array: [u8; 32] = admin_lock_hash.try_into().unwrap();
    
    // Create protocol cell
    let protocol_data = create_protocol_data(admin_lock_hash_array, None);
    let type_id = [42u8; 32];
    
    let protocol_type_script = context
        .build_script(&protocol_out_point, Bytes::from(type_id.to_vec()))
        .expect("build protocol type script");
    
    let protocol_cell_out_point = context.create_cell(
        CellOutput::new_builder()
            .capacity(1000u64.pack())
            .lock(admin_lock.clone())
            .type_(Some(protocol_type_script.clone()).pack())
            .build(),
        protocol_data.clone(),
    );
    
    let input = CellInput::new_builder()
        .previous_output(protocol_cell_out_point)
        .build();
    
    let output = CellOutput::new_builder()
        .capacity(1000u64.pack())
        .lock(admin_lock)
        .type_(Some(protocol_type_script).pack())
        .build();
    
    // Create transaction recipe witness with no arguments (should have at least 1)
    let no_witness = create_recipe_witness("CKBoostProtocol.updateProtocol", vec![]);
    
    let tx = TransactionBuilder::default()
        .input(input)
        .output(output)
        .output_data(protocol_data.pack())
        .witness(no_witness.pack())
        .build();
    
    let tx = context.complete_tx(tx);
    
    // Should fail validation
    let result = context.verify_tx(&tx, 10_000_000);
    assert!(result.is_err());
    println!("Missing arguments correctly rejected: {:?}", result.err());
}