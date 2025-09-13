

Help me build this telegram-webhook:

1. Click start telegram verification and Telegram would redirect user to this /verify with query string param (id, first_name, last_name, username, photo_url, auth_date and hash) plus source=telegram at the begining
2. When /verify received redirection, it would try to update telegram_personal_chat_id, and store a nostr event id that stores id, first_name, last_name, username, photo_url, auth_date and hash, as identity_verification_data.
3. dapp assemble the transaction, with input including old user cell, a regular CKB cell from our verifier, and the fee cell, and the output including the new user cell, ta regular CKB cell for the verifier for the same capacity (which make it a proxy authentication), and the change cell.

4. User then make a POST request to our telegram-webhook.ts with the transaction and our webhook verify the new data in nostr storage. Refer to the following guide on how to verify:

```
Checking authorization
You can verify the authentication and the integrity of the data received by comparing the received hash parameter with the hexadecimal representation of the HMAC-SHA-256 signature of the data-check-string with the SHA256 hash of the bot's token used as a secret key.

Data-check-string is a concatenation of all received fields, sorted in alphabetical order, in the format key=<value> with a line feed character ('\n', 0x0A) used as separator – e.g., 'auth_date=<auth_date>\nfirst_name=<first_name>\nid=<id>\nusername=<username>'.

The full check might look like:

data_check_string = ...
secret_key = SHA256(<bot_token>)
if (hex(HMAC_SHA256(data_check_string, secret_key)) == hash) {
  // data is from Telegram
}
To prevent the use of outdated data, you can additionally check the auth_date field, which contains a Unix timestamp when the authentication was received.
```
5. The verifier signs the transaction, and return to the user
6. The user signs too. and then send transaction