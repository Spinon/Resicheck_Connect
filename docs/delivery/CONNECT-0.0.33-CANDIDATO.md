# Connect 0.0.33 / build33 - release map

Status on 21/11/2026: signed APK delivered through the established private QA channel and Web33 published and verified at https://connect.resicheck.com.br/. See the sanitized [release summary](../../delivery/RELEASE-0.0.33.json).

The common compiled source fingerprint is f7156dd19cf7193fb906a34fc4f95bebca1b2ba2995ca2adfc53a22c1458cfae (261 byte-exact files). APK SHA-256 cde1b78b392cdb2d76226fd50f5fa4fab705b8476f5a304f081fc2bcfdf860a9,46929408bytes,existing certificate fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c. Web export fingerprint 4d9612c2c6d031fbab293c0d59e1db080f322a2e81f004d5bbcb8539876a7b43. Binaries and private QA links are not part of this public checkpoint.

Changes: image transfer response parsing keeps decoded byte bounds while handling CORS-hidden encoding; the staff inbox accepts only the legitimate null/null image-summary pair and uses a fixed presentation label. Selection/removal preserves original data/audit and projects tombstones. Refresh with unchanged data retains position. CNPJ form and staff/client invitation entry are available in the candidate. The client source, lockfiles and opt-in builders are preserved.

Verified with real development APIs: image publication/opening and removal; text smoke; recovered audio dependency plus one synthetic Web recording/publication/other-role playback; existing audio native playback without new upload; authenticated Android API36 emulator and browser navigation. Two emulator background-return cycles passed. No physical device, acoustic output/volume/silent-mode proof, fresh CNPJ business lookup/create, or fresh invitation issuance/acceptance is claimed.

Reproduction: read AGENTS, AMBIENTE and ENTREGAS. Use the adapters in apps/mobile/candidates/messaging33/README.md with an OWNED clone and public configuration obtained through the official project. APK signing custody remains external. The default source does not auto-install a server or grant access. Backend source bindings and tests use non-deployed example identities; see supabase/runtime/image-node/normal/README.md for the explicit private overlay. Host-specific catalog/SQL snapshots, sessions, credentials, logs and evidence payloads are excluded.

The public repository remains Spinon/Resicheck_Connect. Git commits/push, private APK distribution and web deploy are separate operations; this checkpoint records the completed APK/Web delivery; publishing the source branch is a separate operation and does not deploy either platform.

## Hosted Web verification

On 21/11/2026 at00:12UTC, HTTPS200 and the final index/JS hashes matched. The sole CSP change adds blob: to img-src. A77-byte synthetic PNG preview/upload/inspection/publication, opening by the other authorized role, read receipt and inbox passed on the actual served frontend without interception. Two new own sessions logged out and zero remained; existing sessions were untouched. Private screenshots, actors, tenants, session IDs and media receipts remain excluded. Other-site content and existing assets were preserved; the exact previous Connect bundle/configuration is in private rollback custody. The logo encoding differs but decoded pixels are equal; its existing bytes were retained. Unused Metro export metadata was not published.
