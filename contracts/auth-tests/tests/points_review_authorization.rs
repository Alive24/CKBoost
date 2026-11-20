#![cfg(feature = "vm-tests")]

//! Execute the candidate review contracts with the unchanged, publicly verified
//! Points and ClaimablePool ELFs. Wallets are synthetic ALWAYS_SUCCESS fixtures;
//! real wallet/ACP authorization is covered by the separate ACP VM suite.
use ckb_deterministic::generated::{
    Bytes as RecipeBytes, RecipeArgument, RecipeArgumentVec, TransactionRecipe,
};
use ckb_testtool::{
    builtin::ALWAYS_SUCCESS,
    ckb_types::{
        bytes::Bytes,
        core::{TransactionBuilder, TransactionView},
        packed::*,
        prelude::*,
    },
    context::Context,
};
use ckboost_shared::types as mol;
use molecule::prelude::{Builder, Entity};

const CKB: u64 = 100_000_000;
const MAX_CYCLES: u64 = 200_000_000;
const PROTOCOL: &str = "4eacaf9b1a120d2bfd99f26fcedfdcfe6ef116484e9b478b0a104a872316e034";
const LOCK_CODE: &str = "e91b5a78463c293318331c21d372e031eb9ffad87b379fbe0563222fcdd28815";
const CAMPAIGN_CODE: &str = "9004d12f500e558df19c14e08907e014dbfc50ae249500bb5c389f883a1487d2";
const POINTS_CODE: &str = "fcb4b762e3222b603771811b8abe6b054a480a0f5d8011fd9fff266d72189a5e";
const POOL_CODE: &str = "458cacb13a3c40e6d046468e7fe3f5c2c93f0581062e269dc9ffec4858346cb6";

fn hex(value: &str) -> Vec<u8> {
    let value = value.strip_prefix("0x").unwrap_or(value);
    assert_eq!(value.len() % 2, 0);
    (0..value.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&value[i..i + 2], 16).unwrap())
        .collect()
}
fn b32(value: &[u8]) -> mol::Byte32 {
    mol::Byte32::from_slice(value).unwrap()
}
fn script(code_hash: &str, args: Vec<u8>) -> Script {
    Script::new_builder()
        .code_hash(Byte32::from_slice(&hex(code_hash)).unwrap())
        .hash_type(1u8.into())
        .args(Bytes::from(args).pack())
        .build()
}
fn connection(owner: &[u8], protocol: &[u8]) -> Vec<u8> {
    mol::ConnectedTypeID::new_builder()
        .type_id(b32(owner))
        .connected_key(b32(protocol))
        .build()
        .as_slice()
        .to_vec()
}
fn dep(point: OutPoint) -> CellDep {
    CellDep::new_builder()
        .out_point(point)
        .dep_type(0u8.into())
        .build()
}
fn binary(relative: &str) -> Bytes {
    std::fs::read(
        std::path::Path::new(
            &std::env::var("CKBOOST_AUTH_BIN_DIR")
                .expect("set CKBOOST_AUTH_BIN_DIR to the reviewed release directory"),
        )
        .join(relative),
    )
    .expect("reviewed contract bytes")
    .into()
}
fn deploy_pinned(
    context: &mut Context,
    owner: &Script,
    file: &str,
    size: usize,
    data_hash: &str,
    type_args: &str,
    type_hash: &str,
) {
    let bytes = binary(file);
    assert_eq!(bytes.len(), size, "{file}: exact reviewed size");
    assert_eq!(
        CellOutput::calc_data_hash(&bytes).as_slice(),
        hex(data_hash),
        "{file}: exact reviewed CKB data hash"
    );
    let code_type = script(
        "00000000000000000000000000000000000000000000000000545950455f4944",
        hex(type_args),
    );
    assert_eq!(
        code_type.calc_script_hash().as_slice(),
        hex(type_hash),
        "full TypeID hash"
    );
    context.create_cell(
        CellOutput::new_builder()
            .capacity(((size as u64 + 128) * CKB).pack())
            .lock(owner.clone())
            .type_(Some(code_type).pack())
            .build(),
        bytes,
    );
}

#[derive(Clone, Copy, Debug)]
enum Actor {
    Owner,
    Reviewer,
    Foreign,
}
struct Setup {
    context: Context,
    owner: Script,
    reviewer: Script,
    foreign: Script,
    admin: Script,
    claimant: Script,
    campaign_type: Script,
    campaign_lock: Script,
    points_type: Script,
    protocol_dep: CellDep,
}
fn setup(owner_whitelisted: bool) -> Setup {
    let mut context = Context::default();
    context.set_capture_debug(true);
    let always = context.deploy_cell(ALWAYS_SUCCESS.clone());
    let mut wallet = |id| {
        context
            .build_script(&always, Bytes::from(vec![id]))
            .unwrap()
    };
    let owner = wallet(1);
    let foreign = wallet(2);
    let admin = wallet(3);
    let reviewer = wallet(4);
    let claimant = wallet(5);
    deploy_pinned(
        &mut context,
        &admin,
        "ckboost-protocol-lock",
        183920,
        "4085400035c0812c58b432e004a57f8befe987df6e67b8cd2a7e7fc75118cf65",
        "06661a546d171ae6f280f3f1363070c7d1e7ad7dc1032d566c7b16f804d57ab4",
        LOCK_CODE,
    );
    deploy_pinned(
        &mut context,
        &admin,
        "ckboost-campaign-type",
        256040,
        "b8f0ebe8ad9d28ed1c9018fceeeee8e52bea23863dc39d1a4213abe7422ffa33",
        "fe4dcdc1378be473b33321f30db589d220a2947a0156aa41e809af6f1cae5027",
        CAMPAIGN_CODE,
    );
    deploy_pinned(
        &mut context,
        &admin,
        "dependency-public/points-type.elf",
        138784,
        "b61c56ff5d0b9d036f0db63d67ec9cf9d8cb62a20d9de1830659b92261bb150b",
        "c9abd34829d90d4eb1dc28b70e7378df447d26b41d17656362b8fabef226caff",
        POINTS_CODE,
    );
    deploy_pinned(
        &mut context,
        &admin,
        "dependency-public/claimable-pool.elf",
        56600,
        "07aace477ec2a6a11c108037be54bb3ecc2cd003b5db6a5e1a4adf3a5c403fb1",
        "6953e9905a3c922da6974aafdbaf3b22965982894c558a0a125e8dc796a5b8a2",
        POOL_CODE,
    );
    let protocol_type = script(
        "53769be2ed1d09a9da7c1d71488347449bb76f1212068f7e366939d0d5fd59fa",
        hex("53a5053bed009ff6bcfe2762b5c186fdbbffa215cde85868c7becb501f0ef462"),
    );
    assert_eq!(protocol_type.calc_script_hash().as_slice(), hex(PROTOCOL));
    let protocol = hex(PROTOCOL);
    let campaign_type = script(CAMPAIGN_CODE, connection(&[66; 32], &protocol));
    let campaign_lock = script(
        LOCK_CODE,
        connection(owner.calc_script_hash().as_slice(), &protocol),
    );
    let hashes = mol::ScriptCodeHashes::new_builder()
        .ckb_boost_protocol_type_code_hash(b32(protocol_type.code_hash().as_slice()))
        .ckb_boost_campaign_type_code_hash(b32(&hex(CAMPAIGN_CODE)))
        .ckb_boost_protocol_lock_code_hash(b32(&hex(LOCK_CODE)))
        .ckb_boost_points_udt_type_code_hash(b32(&hex(POINTS_CODE)))
        .ckb_boost_funding_lock_code_hash(b32(&[88; 32]))
        .build();
    let mut endorsers = vec![mol::EndorserInfo::new_builder()
        .endorser_lock_hash(b32(foreign.calc_script_hash().as_slice()))
        .build()];
    if owner_whitelisted {
        endorsers.push(
            mol::EndorserInfo::new_builder()
                .endorser_lock_hash(b32(owner.calc_script_hash().as_slice()))
                .build(),
        );
    }
    let protocol_data = mol::ProtocolData::new_builder()
        .protocol_config(
            mol::ProtocolConfig::new_builder()
                .script_code_hashes(hashes)
                .admin_lock_hash_vec(mol::Byte32Vec::from(vec![b32(admin
                    .calc_script_hash()
                    .as_slice())]))
                .build(),
        )
        .endorsers_whitelist(mol::EndorserInfoVec::from(endorsers))
        .build();
    let protocol_point = context.create_cell(
        CellOutput::new_builder()
            .capacity((1000 * CKB).pack())
            .lock(script(
                LOCK_CODE,
                connection(admin.calc_script_hash().as_slice(), &protocol),
            ))
            .type_(Some(protocol_type).pack())
            .build(),
        Bytes::from(protocol_data.as_slice().to_vec()),
    );
    Setup {
        context,
        owner,
        reviewer,
        foreign,
        admin,
        claimant,
        campaign_type,
        campaign_lock,
        points_type: script(POINTS_CODE, protocol),
        protocol_dep: dep(protocol_point),
    }
}
fn campaign(setup: &Setup, staff: bool, approved: bool) -> mol::CampaignData {
    let accepted = if approved {
        vec![b32(&[77; 32])]
    } else {
        vec![]
    };
    let quest = mol::QuestData::default()
        .as_builder()
        .quest_id(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
        .points(mol::Uint128::from_slice(&1u128.to_le_bytes()).unwrap())
        .accepted_submission_user_type_ids(mol::Byte32Vec::from(accepted))
        .completion_count(mol::Uint32::from_slice(&u32::from(approved).to_le_bytes()).unwrap())
        .build();
    mol::CampaignData::new_builder()
        .endorser_lock_hash(b32(setup.owner.calc_script_hash().as_slice()))
        .staff_lock_hash_vec(mol::Byte32Vec::from(if staff {
            vec![b32(setup.reviewer.calc_script_hash().as_slice())]
        } else {
            vec![]
        }))
        .metadata(
            mol::CampaignMetadata::new_builder()
                .title(mol::String::from(b"Campaign".to_vec()))
                .short_description(mol::String::from(b"Summary".to_vec()))
                .long_description(mol::String::from(b"Description".to_vec()))
                .build(),
        )
        .quests(mol::QuestDataVec::from(vec![quest]))
        .total_completions(mol::Uint32::from_slice(&u32::from(approved).to_le_bytes()).unwrap())
        .build()
}
fn pool_data(claimant: &Script, amount: u128) -> Bytes {
    let mut bytes = amount.to_le_bytes().to_vec();
    bytes.extend_from_slice(&1u32.to_le_bytes());
    bytes.extend_from_slice(claimant.calc_script_hash().as_slice());
    bytes.extend_from_slice(&amount.to_le_bytes());
    assert_eq!(bytes.len(), 68);
    bytes.into()
}
fn review_witness() -> Bytes {
    let inline = |bytes: Vec<u8>| {
        RecipeArgument::new_builder()
            .arg_type(0u8)
            .data(RecipeBytes::from(bytes))
            .build()
    };
    let recipe = TransactionRecipe::new_builder()
        .method_path(RecipeBytes::from(
            b"CKBoostCampaign.approve_completion".to_vec(),
        ))
        .arguments(RecipeArgumentVec::from(vec![
            RecipeArgument::new_builder()
                .arg_type(2u8)
                .data(RecipeBytes::from(0u32.to_le_bytes().to_vec()))
                .build(),
            inline(1u32.to_le_bytes().to_vec()),
            inline(
                mol::Byte32Vec::from(vec![b32(&[77; 32])])
                    .as_slice()
                    .to_vec(),
            ),
        ]))
        .build();
    WitnessArgs::new_builder()
        .output_type(Some(Bytes::from(recipe.as_slice().to_vec())).pack())
        .build()
        .as_bytes()
}
fn review(
    setup: &mut Setup,
    actor: Actor,
    input_staff: bool,
    output_staff: bool,
    minted: u128,
) -> TransactionView {
    let actor = match actor {
        Actor::Owner => setup.owner.clone(),
        Actor::Reviewer => setup.reviewer.clone(),
        Actor::Foreign => setup.foreign.clone(),
    };
    let native = setup.context.create_cell(
        CellOutput::new_builder()
            .capacity((1000 * CKB).pack())
            .lock(actor.clone())
            .build(),
        Bytes::new(),
    );
    let current = campaign(setup, input_staff, false);
    let old = setup.context.create_cell(
        CellOutput::new_builder()
            .capacity((1000 * CKB).pack())
            .lock(setup.campaign_lock.clone())
            .type_(Some(setup.campaign_type.clone()).pack())
            .build(),
        Bytes::from(current.as_slice().to_vec()),
    );
    let inputs = vec![
        CellInput::new_builder().previous_output(native).build(),
        CellInput::new_builder().previous_output(old).build(),
    ];
    // No admin input may accidentally select the Points owner-mode shortcut.
    for input in &inputs {
        let cell = setup.context.get_cell(&input.previous_output()).unwrap().0;
        assert_ne!(
            cell.lock().calc_script_hash(),
            setup.admin.calc_script_hash()
        );
    }
    let next = campaign(setup, output_staff, true);
    let pool = CellOutput::new_builder()
        .capacity((206 * CKB).pack())
        .lock(script(
            POOL_CODE,
            actor.calc_script_hash().as_slice().to_vec(),
        ))
        .type_(Some(setup.points_type.clone()).pack())
        .build();
    let tx = TransactionBuilder::default()
        .inputs(inputs)
        .outputs(vec![
            CellOutput::new_builder()
                .capacity((1000 * CKB).pack())
                .lock(setup.campaign_lock.clone())
                .type_(Some(setup.campaign_type.clone()).pack())
                .build(),
            pool,
            CellOutput::new_builder()
                .capacity((793 * CKB).pack())
                .lock(actor)
                .build(),
        ])
        .outputs_data(vec![
            Bytes::from(next.as_slice().to_vec()).pack(),
            pool_data(&setup.claimant, minted).pack(),
            Bytes::new().pack(),
        ])
        .cell_dep(setup.protocol_dep.clone())
        .witnesses(vec![Bytes::new().pack(), review_witness().pack()])
        .build();
    setup.context.complete_tx(tx)
}
fn expect_vm(setup: &Setup, tx: &TransactionView, allowed: bool, label: &str) {
    let result = setup.context.verify_tx(tx, MAX_CYCLES);
    assert_eq!(
        result.is_ok(),
        allowed,
        "{label}: {result:?}\n{:?}",
        setup.context.captured_messages()
    );
    println!("{label}: {result:?}");
}

#[test]
fn owner_mints_exactly_one_point_to_c_pool_without_admin() {
    let mut s = setup(true);
    let tx = review(&mut s, Actor::Owner, true, true, 1);
    expect_vm(&s, &tx, true, "owner exact 1 Point mint; no admin input");
}
#[test]
fn assigned_reviewer_mints_exactly_one_point_to_c_pool_without_admin() {
    let mut s = setup(true);
    let tx = review(&mut s, Actor::Reviewer, true, true, 1);
    expect_vm(
        &s,
        &tx,
        true,
        "assigned reviewer exact 1 Point mint; no admin input",
    );
}
#[test]
fn owner_and_reviewer_cannot_overmint_or_omit_the_earned_point() {
    for actor in [Actor::Owner, Actor::Reviewer] {
        for amount in [0, 2] {
            let mut s = setup(true);
            let tx = review(&mut s, actor, true, true, amount);
            expect_vm(&s, &tx, false, &format!("{actor:?} wrong mint {amount}"));
        }
    }
}
#[test]
fn foreign_whitelisted_organizer_cannot_mint_for_another_owners_campaign() {
    let mut s = setup(true);
    let tx = review(&mut s, Actor::Foreign, true, true, 1);
    expect_vm(&s, &tx, false, "foreign whitelisted organizer rejected");
}
#[test]
fn revoked_owner_and_removed_reviewer_cannot_mint() {
    let mut s = setup(false);
    let tx = review(&mut s, Actor::Owner, true, true, 1);
    expect_vm(&s, &tx, false, "revoked organizer owner rejected");
    let mut s = setup(true);
    let tx = review(&mut s, Actor::Reviewer, false, false, 1);
    expect_vm(&s, &tx, false, "removed reviewer rejected");
}
#[test]
fn output_only_reviewer_assignment_cannot_authorize_mint() {
    let mut s = setup(true);
    let tx = review(&mut s, Actor::Reviewer, false, true, 1);
    expect_vm(&s, &tx, false, "output-only reviewer assignment rejected");
}

#[test]
fn c_claim_executes_actual_pool_and_points_elves_and_rejects_redirection() {
    for redirect in [false, true] {
        let mut s = setup(true);
        let minted = review(&mut s, Actor::Reviewer, true, true, 1);
        expect_vm(&s, &minted, true, "reviewer mint before actual pool claim");
        // Materialize the exact verified review output, rather than constructing
        // a second independently authored pool fixture.
        let pool_output = minted.outputs().get(1).unwrap();
        let pool_bytes = minted.outputs_data().get(1).unwrap().raw_data();
        let pool_point = s.context.create_cell(pool_output.clone(), pool_bytes);
        let c_native = s.context.create_cell(
            CellOutput::new_builder()
                .capacity((1000 * CKB).pack())
                .lock(s.claimant.clone())
                .build(),
            Bytes::new(),
        );
        let mut empty_pool = 0u128.to_le_bytes().to_vec();
        empty_pool.extend_from_slice(&0u32.to_le_bytes());
        let recipient = if redirect {
            s.foreign.clone()
        } else {
            s.claimant.clone()
        };
        let tx = TransactionBuilder::default()
            .inputs(vec![
                CellInput::new_builder().previous_output(c_native).build(),
                CellInput::new_builder().previous_output(pool_point).build(),
            ])
            .outputs(vec![
                pool_output,
                CellOutput::new_builder()
                    .capacity((142 * CKB).pack())
                    .lock(recipient)
                    .type_(Some(s.points_type.clone()).pack())
                    .build(),
                CellOutput::new_builder()
                    .capacity((857 * CKB).pack())
                    .lock(s.claimant.clone())
                    .build(),
            ])
            .outputs_data(vec![
                Bytes::from(empty_pool).pack(),
                Bytes::from(1u128.to_le_bytes().to_vec()).pack(),
                Bytes::new().pack(),
            ])
            .witnesses(vec![Bytes::new().pack(), Bytes::new().pack()])
            .build();
        let tx = s.context.complete_tx(tx);
        expect_vm(
            &s,
            &tx,
            !redirect,
            if redirect {
                "pool claim redirection rejected"
            } else {
                "C claims 1 Point; actual pool lock executes; recycler remainder unchanged"
            },
        );
    }
}
