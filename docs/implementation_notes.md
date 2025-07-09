# Implementation Notes

## Layered Storage

1. On-chain First:
   - Protocol Data
   - Campaign Data
   - Approval and Reward Records
2. Off-chain Data:
   - Completion content; Only reference.

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
