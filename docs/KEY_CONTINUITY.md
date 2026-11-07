# MK13 · Key Rotation, Self-Revocation, and Continuity Reviews

**Pattern Atlas v1.3.0 · November 6, 2026**

## Scope and threat model

MK12 introduced locally generated P-256 signing keys and ECDSA signatures for Case Capsules. MK13 provides **dual-signed transition records**, **signed self-revocation notices**, and **review of a key lineage anchored to a fingerprint a reviewer already trusts**.

This is not a certificate authority, identity service, centralized revocation registry, or trusted timestamp provider.

A cryptographically valid document attests to control of the corresponding signing key. It cannot independently prove the key operator's real-world identity, whether the key was stolen, the veracity of research, or the authenticity of original evidence.

## Issuing a new key

1. In **Key continuity**, load the old MK12 **encrypted key backup** into the first slot and enter its passphrase. The key is decrypted in browser memory only.
2. Independently compare the displayed old SPKI fingerprint with a previously trusted copy.
3. Generate a new P-256 key pair, and **download an encrypted backup using a distinct, strong passphrase** before creating a rotation certificate. The UI intentionally disables rotation until the backup is exported.
4. Write a specific reason for rotating. A certificate is signed **twice over the same canonical statement**, by the old private key and the new private key, proving possession of both at issuance time.
5. Export the rotation certificate, retain it, and publish it via a channel where recipients can independently check the old fingerprint and new public key.
6. Open **Capsule signatures** and restore the new encrypted key backup to sign subsequent capsules. MK13 does not silently alter the MK12 in-memory key or old signed files.

Rotation records contain the old and new restricted public P-256 JWK coordinates, their SPKI SHA-256 fingerprints, a self-reported UTC rotation timestamp, explanatory reason, and 64-byte ECDSA-P256-SHA256 signature from each signer.

**If the old key is lost, dual-signed rotation is impossible.** Establish a new root fingerprint out of band. Do not fabricate a continuity certificate.

If the old key is compromised, a two-key rotation alone cannot prove that the rightful owner approved it: the attacker may sign the old-key portion. Independently confirm the new fingerprint and alert collaborators through existing trusted channels.

## Issuing a self-revocation warning

Load the key whose future use should be distrusted, write a specific reason, and export its signed self-revocation notice. The warning is signed with the **same key** being retired. This is limited evidence:

- Anyone controlling a stolen key may also produce a valid revocation notice.
- The tool does not contact a server, update other researchers, or revoke signatures automatically.
- Browser-reported dates, including the notice's creation time, are not trusted timestamps.
- Old signatures do **not** become cryptographically invalid retroactively. Determining their historical trustworthiness requires independent publication/timing evidence.

Distribute a notice through a communication channel reviewers actually monitor, preferably with independently authenticated author statements.

## Reviewing a key lineage

The reviewer supplies the **SHA-256 SPKI fingerprint of the original trusted key from a separately trusted channel**. The verifier never treats a root fingerprint embedded in a downloaded bundle as sufficient authority.

Import rotation and revocation JSON files in intended sequence or select a combined continuity bundle. The verifier:

1. Checks document formats and that no private JWK fields, unexpected fields, wrong algorithms, or unsupported curves appear.
2. Recomputes both public-key fingerprints for every rotation and verifies both ECDSA signatures over the exact canonical statement.
3. Checks that each rotation's predecessor is the currently reached key, with no cycles or repeated keys.
4. Verifies signed self-revocation warnings and rejects unrelated-key or duplicate notices in that lineage.
5. Checks that the bundle root equals the reviewer-supplied independent trust anchor.
6. When verifying an MK12 signed capsule, validates its signature and underlying MK11 research packet, then determines whether its signer belongs to the trusted lineage and is the **current, non-self-revoked** key.

An earlier key's signature may remain cryptographically valid, but the verifier labels it **historical, not current-use accepted**. A self-revoked key is flagged as a warning; self-reported signing and revocation dates cannot establish which event truly came first.

## Portable file formats and privacy

- `pattern-atlas-key-rotation-v1`: a statement with predecessor and replacement key and two ECDSA signatures.
- `pattern-atlas-key-revocation-v1`: a statement with public key, self-reported date, reason, and one key-holder signature.
- `pattern-atlas-key-continuity-v1`: root fingerprint, ordered rotation records, and revocation notices. This is a *review aid*, not an independent trust anchor.

Up to 12 rotations and 20 self-revocation notices can be checked together. Upload-style file controls **read local JSON only; files are not transmitted**. No signing keys, passphrases, notices or root fingerprints are automatically persisted to browser storage.

**Keep independent copies** of encrypted private-key backups, public-card fingerprints, rotation notices, and revocation announcements. Users must manage publication and key compromise response themselves.

## Tests

Run `npm test` and `npm run build`. MK13 adds checks for dual-signature authorization, altered keys and reasons, unauthorized branching, key cycles, missing trust roots, malformed public keys, duplicate self-revocations, signed capsule review under current and historical keys, and lack of trusted clock assumptions.

**Ledger Above Ego. Evidence Above Assumption.**
