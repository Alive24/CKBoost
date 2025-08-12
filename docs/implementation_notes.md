# Implementation Notes

## Layered Storage

1. On-chain First:
   - Protocol Data (singleton cell with standard type_id)
   - Campaign Data (cells with ConnectedTypeID: type_id + connected_type_hash pointing to protocol type hash)
   - User Data (cells with ConnectedTypeID: type_id + connected_type_hash pointing to protocol type hash)
   - Approval Records (user type_ids stored in quest's accepted_submission_user_type_ids)
2. Off-chain Data:
   - Completion content stored in Neon database (only URLs stored on-chain)

## Verification

1. Limit changes to the verification records:
   - Get pubkey from protocol
   - Get signature from witness
   - Get intended account from verification record
   - Check if the signature is valid

## Intent

- Intent only if approval is needed (e.g. not verification).
- Put operation name in witness in creation of intent for SSRI.
- Put operation data in user cell.
