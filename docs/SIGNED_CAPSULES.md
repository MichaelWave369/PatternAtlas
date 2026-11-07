# MK12 · Signed Case Capsules

**Pattern Atlas v1.2.0 · November 6, 2026**

## What this adds

MK11 bundles a selected research case, audited source records and optional private annotations in a portable, SHA-256-checked JSON capsule. MK12 adds **ECDSA P-256/SHA-256 signatures** over the entire validated MK11 capsule together with the public key, signer label and reported signing timestamp.

The signature confirms only that **a holder of the corresponding private key signed those bytes**. A self-issued public key and researcher-entered signer label are **not proof of a human identity, original document authenticity, transaction settlement, or the truth of any claim**.

## Workflow

1. Open **Case capsule** and export an unsigned MK11 capsule. Review locally authored case content and the optional private evidence layers before sharing.
2. Open **Capsule signatures** and select **Generate a new signing key**. The public-key fingerprint is SHA-256 of its standardized SPKI encoding.
3. Immediately create an **encrypted private-key backup** using a passphrase of 12 or more characters, and keep that file separately from the passphrase. The key otherwise exists only in page memory. Closing the page, refreshing, or navigating away loses the in-memory key.
4. Export a **public-key card** and deliver its fingerprint to intended reviewers using an independently trusted channel, not merely the signed capsule itself.
5. Choose an unsigned MK11 capsule to sign. The browser verifies the inner capsule first, signs the entire statement, and downloads a separate signed JSON file. The original capsule stays unchanged.
6. A verifier selects the signed JSON and, optionally, pastes a **separately authenticated public-key fingerprint**. MK12 verifies the ECDSA signature, public-key SPKI fingerprint, MK11 capsule digest, source audit structure and any opted-in PDF/handling layers.
7. If the expected fingerprint does not match, verification **fails even if the cryptographic signature is internally valid**.

**No file is automatically imported into a case, saved to localStorage, synchronized or transmitted to a server.** The signing key exists in volatile browser memory only. The signed JSON may contain private original-document notes or handling records if the author explicitly included those in the original MK11 capsule.

## Cryptographic format

- Public-key algorithm: **ECDSA with the NIST P-256 curve, SHA-256 hash**. Signatures follow the browser's IEEE-P1363 raw 64-byte representation of the two 256-bit signature integers, encoded using unpadded base64url.
- The signed statement is canonical JSON: field names sorted deterministically, arrays retaining their original order.
- Format: `pattern-atlas-signed-capsule-v1` with a statement and signature. The statement includes the complete MK11 capsule, algorithm, self-reported signer label, browser-reported signing time, restricted public P-256 JWK coordinates, and public-key fingerprint.
- The public-key fingerprint is **SHA-256 of the DER SPKI encoding**, not a hash of the displayed nickname.
- Verification rejects missing/unexpected fields, embedded private JWK material, unsupported algorithms/curves, malformed signatures, altered signed labels, changed capsule contents and incorrect pinned fingerprints.
- Max signed package size: the existing 3.5 MB MK11 payload limit plus up to 6 KB for metadata and signature.

## Private-key backup

- A signing key is generated in WebCrypto as **extractable in memory** solely to allow an explicit encrypted backup. The app does not store raw private-key bytes or passphrases in localStorage, GitHub, or any server.
- Private-key PKCS#8 bytes are encrypted with **AES-256-GCM** using a random 12-byte nonce, random 16-byte salt and a 256-bit AES key derived using **PBKDF2-HMAC-SHA-256, 310,000 iterations**. A fixed context string is authenticated as AES-GCM additional data.
- Exported backup files contain public-key information and AES-GCM ciphertext, not plaintext PKCS#8 bytes. **Use a strong, unique passphrase** and store it separately.
- Decryption validates the backup schema, encryption parameters and advertised public key; it **signs and verifies a temporary challenge** to confirm the private and public keys match before accepting the restored identity.
- The tool cannot recover lost passphrases, revoke a compromised key, audit a browser extension, or prevent malicious script execution in a compromised browser. Use current, trusted browsers and operating systems.

## Interpreting the verification results

- **Signature valid, fingerprint not independently checked:** cryptographic integrity only; *author identity unverified*.
- **Signature valid, fingerprint matches an independently trusted key:** strengthens confidence that the expected key signed this capsule. Key theft and false statements remain possible.
- **Signature valid, fingerprint mismatch:** verification fails as the signed file is not from the expected key.
- **Invalid signature or invalid inner capsule:** verification fails; inspect damage, tampering or inconsistent records. Do not infer that a valid-looking public-key card authenticates a person.

There is no key server, PKI certificate authority, identity registry or trusted timestamping in MK12. A keycard supplied in the same untrusted channel as the signed document is not independent identity evidence. Key rotation and revocation are not yet supported.

## Tests and scope

Run `npm test` and `npm run build`. Tests cover key generation, SPKI fingerprint stability, signing and verifying signed/unsigned capsules, label/source tampering, replacement public keys, wrong trusted fingerprints, malformed envelopes, PBKDF2/AES-GCM encrypted backups, wrong passphrases and corrupted key backups.

MK12 deliberately preserves the existing MK11 exports and import checks, and does not modify the underlying case dataset.

**Ledger Above Ego. Evidence Above Assumption.**
