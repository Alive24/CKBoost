#![allow(dead_code, unused_imports, unused_variables)]
extern crate alloc;

// Exercise the exact recipe registered by verify_update_campaign, including
// structure, protocol relationship, script immutability and business rules.
#[path = "../../contracts/ckboost-protocol-type/src/recipes.rs"]
mod protocol_recipe;
#[path = "../../contracts/ckboost-campaign-type/src/recipes.rs"]
mod recipes;

use ckb_deterministic::{
    cell_classifier::{CellInfo, ClassifiedCells, RuleBasedClassifier},
    generated::{Bytes as RecipeBytes, RecipeArgument, RecipeArgumentVec, TransactionRecipe},
    transaction_context::TransactionContext,
};
use ckb_std::{
    ckb_constants::Source,
    ckb_types::{packed::Script, prelude::*},
};
use ckboost_shared::{campaign_authorization::validate_protocol_settings, types as mol};
use molecule::prelude::{Builder, Entity};

const OWNER: u8 = 11;
const OTHER: u8 = 12;
const ADMIN: u8 = 13;
const STAFF: u8 = 14;
const PROTOCOL: u8 = 21;
const CAMPAIGN_CODE: u8 = 22;
const LOCK_CODE: u8 = 23;

fn b32(value: u8) -> mol::Byte32 {
    mol::Byte32::from_slice(&[value; 32]).unwrap()
}
fn string(value: &str) -> mol::String {
    mol::String::from(value.as_bytes().to_vec())
}
fn connection(owner: u8, protocol: u8) -> Vec<u8> {
    mol::ConnectedTypeID::new_builder()
        .type_id(b32(owner))
        .connected_key(b32(protocol))
        .build()
        .as_slice()
        .to_vec()
}
fn script(code: u8, args: Vec<u8>) -> Script {
    Script::new_builder()
        .code_hash([code; 32].pack())
        .hash_type(1u8.into())
        .args(args.pack())
        .build()
}
fn protocol(admins: &[u8], organizers: &[u8]) -> mol::ProtocolData {
    let hashes = mol::ScriptCodeHashes::new_builder()
        .ckb_boost_campaign_type_code_hash(b32(CAMPAIGN_CODE))
        .ckb_boost_protocol_lock_code_hash(b32(LOCK_CODE))
        .build();
    mol::ProtocolData::new_builder()
        .protocol_config(
            mol::ProtocolConfig::new_builder()
                .script_code_hashes(hashes)
                .admin_lock_hash_vec(mol::Byte32Vec::from(
                    admins.iter().map(|hash| b32(*hash)).collect::<Vec<_>>(),
                ))
                .build(),
        )
        .endorsers_whitelist(mol::EndorserInfoVec::from(
            organizers
                .iter()
                .map(|hash| {
                    mol::EndorserInfo::new_builder()
                        .endorser_lock_hash(b32(*hash))
                        .verified(mol::Uint8::from_slice(&[0]).unwrap())
                        .build()
                })
                .collect::<Vec<_>>(),
        ))
        .build()
}
fn campaign(owner: u8, staff: &[u8]) -> mol::CampaignData {
    mol::CampaignData::new_builder()
        .endorser_lock_hash(b32(owner))
        .staff_lock_hash_vec(mol::Byte32Vec::from(
            staff.iter().map(|hash| b32(*hash)).collect::<Vec<_>>(),
        ))
        .metadata(
            mol::CampaignMetadata::new_builder()
                .title(string("Campaign"))
                .short_description(string("Summary"))
                .long_description(string("Description"))
                .build(),
        )
        .quests(mol::QuestDataVec::from(vec![mol::QuestData::default()]))
        .build()
}
fn cell(
    source: Source,
    data: Vec<u8>,
    lock: Script,
    type_script: Option<Script>,
    type_hash: Option<[u8; 32]>,
) -> CellInfo {
    let lock_hash = lock.calc_script_hash().unpack();
    CellInfo {
        source,
        index: 0,
        data,
        lock,
        lock_hash,
        type_script,
        type_hash,
    }
}
fn context(
    creation: bool,
    signer: u8,
    organizers: &[u8],
    owner: u8,
    staff: &[u8],
) -> TransactionContext<RuleBasedClassifier> {
    let protocol = protocol(&[ADMIN], organizers);
    let type_script = script(CAMPAIGN_CODE, connection(31, PROTOCOL));
    let lock = script(LOCK_CODE, connection(owner, PROTOCOL));
    let data = campaign(owner, staff).as_slice().to_vec();
    let mut input = ClassifiedCells::default();
    let mut proxy = cell(Source::Input, vec![], script(99, vec![signer]), None, None);
    // The pre-collected context carries the signature-lock hash verified by
    // the cell collector; this test controls the relevant authorizing identity.
    proxy.lock_hash = [signer; 32];
    input.simple_ckb_cells.push(proxy);
    if !creation {
        input.custom_cells.insert(
            "campaign".into(),
            vec![cell(
                Source::Input,
                data.clone(),
                lock.clone(),
                Some(type_script.clone()),
                Some([32; 32]),
            )],
        );
    }
    let mut output = ClassifiedCells::default();
    output.custom_cells.insert(
        "campaign".into(),
        vec![cell(
            Source::Output,
            data,
            lock,
            Some(type_script),
            Some([32; 32]),
        )],
    );
    let mut deps = ClassifiedCells::default();
    deps.custom_cells.insert(
        "protocol".into(),
        vec![cell(
            Source::CellDep,
            protocol.as_slice().to_vec(),
            script(LOCK_CODE, connection(ADMIN, PROTOCOL)),
            Some(script(98, vec![])),
            Some([PROTOCOL; 32]),
        )],
    );
    let recipe = TransactionRecipe::new_builder()
        .method_path(RecipeBytes::from(
            b"CKBoostCampaign.update_campaign".to_vec(),
        ))
        .arguments(RecipeArgumentVec::from(vec![RecipeArgument::new_builder()
            .arg_type(0u8)
            .data(RecipeBytes::from(Vec::<u8>::new()))
            .build()]))
        .build();
    TransactionContext::from_parts(recipe, input, output, deps, vec![])
}
fn valid(context: &TransactionContext<RuleBasedClassifier>) -> bool {
    let mut rules = recipes::update_campaign::get_rules_for_udts(vec![]);
    // This syscall predicate is exercised by the full CKB-VM/real ACP suite.
    rules
        .business_rules
        .retain(|rule| rule.rule_name != "settings_actor_capacity_spend");
    rules.validate(context).is_ok()
}
fn review_context(
    mut tx: TransactionContext<RuleBasedClassifier>,
) -> TransactionContext<RuleBasedClassifier> {
    let argument = |bytes: Vec<u8>| {
        RecipeArgument::new_builder()
            .arg_type(0u8)
            .data(RecipeBytes::from(bytes))
            .build()
    };
    tx.recipe = TransactionRecipe::new_builder()
        .method_path(RecipeBytes::from(
            b"CKBoostCampaign.approve_completion".to_vec(),
        ))
        .arguments(RecipeArgumentVec::from(vec![
            argument(vec![]),
            argument(0u32.to_le_bytes().to_vec()),
            argument(vec![]),
        ]))
        .build();
    tx
}

#[test]
fn organizer_and_admin_create_their_own_campaigns() {
    assert!(valid(&context(true, OWNER, &[OWNER], OWNER, &[])));
    assert!(valid(&context(true, ADMIN, &[], ADMIN, &[])));
}
#[test]
fn ordinary_wallet_or_spoofed_owner_cannot_create() {
    assert!(!valid(&context(true, OTHER, &[OWNER], OTHER, &[])));
    assert!(!valid(&context(true, OTHER, &[OWNER], OWNER, &[])));
    assert!(!valid(&context(true, ADMIN, &[OWNER], OWNER, &[])));
}
#[test]
fn organizer_edits_own_settings_admin_can_override() {
    assert!(valid(&context(false, OWNER, &[OWNER], OWNER, &[STAFF])));
    assert!(valid(&context(false, ADMIN, &[], OWNER, &[STAFF])));
}
#[test]
fn different_organizer_revoked_owner_and_staff_cannot_edit() {
    assert!(!valid(&context(
        false,
        OTHER,
        &[OWNER, OTHER],
        OWNER,
        &[STAFF]
    )));
    assert!(!valid(&context(false, OWNER, &[], OWNER, &[STAFF])));
    assert!(!valid(&context(false, STAFF, &[OWNER], OWNER, &[STAFF])));
}
#[test]
fn adding_self_to_output_staff_does_not_authorize_settings() {
    let mut tx = context(false, OTHER, &[OWNER], OWNER, &[]);
    tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data =
        campaign(OWNER, &[OTHER]).as_slice().to_vec();
    assert!(!valid(&tx));
}
#[test]
fn owner_script_and_protocol_binding_cannot_be_replaced() {
    for mode in 0..4 {
        let mut tx = context(false, OWNER, &[OWNER], OWNER, &[]);
        let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
        match mode {
            0 => output.lock = script(LOCK_CODE, connection(OTHER, PROTOCOL)),
            1 => output.lock = script(LOCK_CODE, connection(OWNER, OTHER)),
            2 => output.lock = script(OTHER, connection(OWNER, PROTOCOL)),
            _ => output.type_script = Some(script(CAMPAIGN_CODE, connection(31, OTHER))),
        };
        output.lock_hash = output.lock.calc_script_hash().unpack();
        assert!(!valid(&tx));
    }
}
#[test]
fn staff_management_is_the_same_owned_settings_operation() {
    for (signer, allowed) in [(OWNER, true), (ADMIN, true), (OTHER, false), (STAFF, false)] {
        for removing in [false, true] {
            let mut tx = context(false, signer, &[OWNER, OTHER], OWNER, if removing { &[STAFF] } else { &[] });
            tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data =
                campaign(OWNER, if removing { &[] } else { &[STAFF] }).as_slice().to_vec();
            assert_eq!(valid(&tx), allowed, "staff change signer={signer}, removing={removing}");
        }
    }
}

#[test]
fn legacy_endorsement_metadata_does_not_replace_the_lock_owner() {
    for (signer, allowed) in [(OWNER, true), (ADMIN, true), (OTHER, false)] {
        let mut tx = context(false, signer, &[OWNER, OTHER], OWNER, &[]);
        let metadata = campaign(OTHER, &[]).as_slice().to_vec();
        tx.input_cells.custom_cells.get_mut("campaign").unwrap()[0].data = metadata.clone();
        tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data = metadata;
        assert_eq!(valid(&tx), allowed);
    }
    let mut tx = context(true, OWNER, &[OWNER], OWNER, &[]);
    tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data =
        campaign(OTHER, &[]).as_slice().to_vec();
    assert!(!valid(&tx));
}
#[test]
fn organizer_grants_require_an_input_admin_not_a_new_output_admin() {
    let mut tx = context(false, OTHER, &[], OWNER, &[]);
    let lock = script(LOCK_CODE, connection(ADMIN, PROTOCOL));
    let input = cell(
        Source::Input,
        protocol(&[ADMIN], &[]).as_slice().to_vec(),
        lock.clone(),
        Some(script(98, vec![])),
        Some([PROTOCOL; 32]),
    );
    let output = cell(
        Source::Output,
        protocol(&[OTHER], &[OTHER]).as_slice().to_vec(),
        lock.clone(),
        Some(script(98, vec![])),
        Some([PROTOCOL; 32]),
    );
    tx.input_cells
        .custom_cells
        .insert("protocol".into(), vec![input]);
    tx.output_cells
        .custom_cells
        .insert("protocol".into(), vec![output]);
    tx.input_cells.custom_cells.remove("campaign");
    tx.output_cells.custom_cells.remove("campaign");
    tx.recipe = tx
        .recipe
        .as_builder()
        .method_path(RecipeBytes::from(
            b"CKBoostProtocol.update_protocol".to_vec(),
        ))
        .build();
    assert!(protocol_recipe::update_protocol::get_rules()
        .validate(&tx)
        .is_ok());
    assert!(validate_protocol_settings(&tx, &lock).is_err());
    tx.input_cells.simple_ckb_cells[0].lock_hash = [ADMIN; 32];
    assert!(validate_protocol_settings(&tx, &lock).is_ok());
}

#[test]
fn settings_cannot_approve_or_change_completion_totals() {
    for mode in 0..3 {
        let mut tx = context(false, OWNER, &[OWNER], OWNER, &[]);
        let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
        let data = mol::CampaignData::from_slice(&output.data).unwrap();
        let next = match mode {
            0 => data
                .as_builder()
                .total_completions(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
                .build(),
            1 => data
                .as_builder()
                .participants_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
                .build(),
            _ => {
                let quest = data
                    .quests()
                    .get(0)
                    .unwrap()
                    .as_builder()
                    .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(41)]))
                    .build();
                data.as_builder()
                    .quests(mol::QuestDataVec::from(vec![quest]))
                    .build()
            }
        };
        output.data = next.as_slice().to_vec();
        assert!(!valid(&tx));
    }
}

#[test]
fn new_quests_cannot_start_with_approvals_but_unused_quests_can_be_replaced() {
    let mut tx = context(true, OWNER, &[OWNER], OWNER, &[]);
    let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
    let data = mol::CampaignData::from_slice(&output.data).unwrap();
    let quest = data
        .quests()
        .get(0)
        .unwrap()
        .as_builder()
        .completion_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
        .build();
    output.data = data
        .as_builder()
        .quests(mol::QuestDataVec::from(vec![quest]))
        .build()
        .as_slice()
        .to_vec();
    assert!(!valid(&tx));
    let mut tx = context(false, OWNER, &[OWNER], OWNER, &[]);
    let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
    let data = mol::CampaignData::from_slice(&output.data).unwrap();
    let quest = data
        .quests()
        .get(0)
        .unwrap()
        .as_builder()
        .quest_id(mol::Uint32::from_slice(&2u32.to_le_bytes()).unwrap())
        .build();
    output.data = data
        .as_builder()
        .quests(mol::QuestDataVec::from(vec![quest]))
        .build()
        .as_slice()
        .to_vec();
    assert!(valid(&tx));
}

#[test]
fn creation_cannot_forge_campaign_totals() {
    for participants in [true, false] {
        let mut tx = context(true, OWNER, &[OWNER], OWNER, &[]);
        let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
        let data = mol::CampaignData::from_slice(&output.data).unwrap();
        let one = mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap();
        output.data = if participants {
            data.as_builder().participants_count(one).build()
        } else {
            data.as_builder().total_completions(one).build()
        }
        .as_slice()
        .to_vec();
        assert!(!valid(&tx));
    }
}

#[test]
fn deleting_unused_published_quests_preserves_others_but_used_quests_cannot_be_deleted() {
    for used in [false, true] {
        let mut tx = context(false, OWNER, &[OWNER], OWNER, &[]);
        let initial = campaign(OWNER, &[]);
        let first = if used {
            mol::QuestData::default()
                .as_builder()
                .accepted_submission_user_type_ids(mol::Byte32Vec::from(vec![b32(41)]))
                .completion_count(mol::Uint32::from_slice(&1u32.to_le_bytes()).unwrap())
                .build()
        } else {
            mol::QuestData::default()
        };
        let remaining = mol::QuestData::default()
            .as_builder()
            .quest_id(mol::Uint32::from_slice(&9u32.to_le_bytes()).unwrap())
            .build();
        tx.input_cells.custom_cells.get_mut("campaign").unwrap()[0].data = initial
            .clone()
            .as_builder()
            .quests(mol::QuestDataVec::from(vec![first, remaining.clone()]))
            .build()
            .as_slice()
            .to_vec();
        tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data = initial
            .as_builder()
            .quests(mol::QuestDataVec::from(vec![remaining]))
            .build()
            .as_slice()
            .to_vec();
        assert_eq!(valid(&tx), !used);
    }
}

#[test]
fn registered_review_rule_allows_admin_owned_organizer_or_input_staff_not_output_staff() {
    let rules = recipes::approve_completion::get_rules_for_udts(vec![]);
    let authorization = rules
        .business_rules
        .iter()
        .find(|rule| rule.rule_name == "reviewer_authorization")
        .expect("approval authorization must be registered");
    for (signer, allowed) in [(ADMIN, true), (STAFF, true), (OWNER, true), (OTHER, false)] {
        let tx = review_context(context(false, signer, &[OWNER, OTHER], OWNER, &[STAFF]));
        assert_eq!((authorization.predicate)(&tx).is_ok(), allowed);
    }
    let mut tx = review_context(context(false, OTHER, &[OWNER, OTHER], OWNER, &[]));
    tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0].data =
        campaign(OWNER, &[OTHER]).as_slice().to_vec();
    assert!((authorization.predicate)(&tx).is_err());
}

#[test]
fn review_organizer_revocation_and_campaign_scoped_reviewer_assignment() {
    for (signer, organizers, staff, allowed) in [
        (OWNER, vec![OWNER], vec![], true),
        (OWNER, vec![], vec![], false),
        (OTHER, vec![OWNER, OTHER], vec![], false),
        (STAFF, vec![OWNER], vec![STAFF], true),
        (STAFF, vec![OWNER], vec![], false),
        // Independent roles overlap: revoking Organizer does not revoke a
        // separate assignment present on this input campaign.
        (OWNER, vec![], vec![OWNER], true),
        (ADMIN, vec![], vec![], true),
    ] {
        let tx = review_context(context(false, signer, &organizers, OWNER, &staff));
        assert_eq!(ckboost_shared::campaign_authorization::validate_campaign_review(&tx).is_ok(), allowed, "review signer={signer}");
    }
    // A reviewer assigned on a different campaign has no global reviewer grant.
    let other_campaign = review_context(context(false, STAFF, &[OWNER, OTHER], OTHER, &[]));
    assert!(ckboost_shared::campaign_authorization::validate_campaign_review(&other_campaign).is_err());
}

#[test]
fn organizer_review_uses_trusted_input_lock_not_endorsement_or_output_owner() {
    for mode in 0..5 {
        let mut tx = review_context(context(false, OWNER, &[OWNER, OTHER], OWNER, &[]));
        let invalid_lock = match mode {
            0 => script(OTHER, connection(OWNER, PROTOCOL)),
            1 => script(LOCK_CODE, connection(OWNER, OTHER)),
            2 => script(LOCK_CODE, vec![0]),
            3 => script(LOCK_CODE, connection(OWNER, PROTOCOL)).as_builder().hash_type(0u8.into()).build(),
            _ => script(LOCK_CODE, connection(OTHER, PROTOCOL)),
        };
        let input = &mut tx.input_cells.custom_cells.get_mut("campaign").unwrap()[0];
        input.lock = invalid_lock; input.lock_hash = input.lock.calc_script_hash().unpack();
        assert!(ckboost_shared::campaign_authorization::validate_campaign_review(&tx).is_err(), "invalid input owner mode={mode}");
    }
    // Endorsement metadata is legacy display information. The actual current
    // Organizer owner retains review access even if that metadata is different.
    for (signer, allowed) in [(OWNER, true), (OTHER, false)] {
        let mut tx = review_context(context(false, signer, &[OWNER, OTHER], OWNER, &[]));
        for cells in [&mut tx.input_cells, &mut tx.output_cells] {
            cells.custom_cells.get_mut("campaign").unwrap()[0].data = campaign(OTHER, &[]).as_slice().to_vec();
        }
        assert_eq!(ckboost_shared::campaign_authorization::validate_campaign_review(&tx).is_ok(), allowed);
    }
}

#[test]
fn reviewer_cannot_change_settings_while_approving() {
    let rules = recipes::approve_completion::get_rules_for_udts(vec![]);
    let authorization = rules
        .business_rules
        .iter()
        .find(|rule| rule.rule_name == "reviewer_authorization")
        .unwrap();
    for signer in [STAFF, OWNER, ADMIN] {
        let mut tx = review_context(context(false, signer, &[OWNER], OWNER, &[STAFF]));
        let output = &mut tx.output_cells.custom_cells.get_mut("campaign").unwrap()[0];
        let data = mol::CampaignData::from_slice(&output.data).unwrap();
        output.data = data
            .as_builder()
            .staff_lock_hash_vec(mol::Byte32Vec::from(vec![b32(OTHER)]))
            .build()
            .as_slice()
            .to_vec();
        assert!((authorization.predicate)(&tx).is_err(), "review cannot also reassign staff signer={signer}");
    }
}
