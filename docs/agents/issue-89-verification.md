# Issue 89 served integration evidence

## Fixture setup

Generated synthetic opaque documents from the existing AES and comparison demo builders:

```sh
fish -lc 'cd frontend; nvm use; env SERVED_LESSONS_ROOT=../baseline/content/lessons node scripts/export_served_lessons.mjs'
```

The mounted directory was `baseline/content`, read-only at `/content`. The local
Compose project was `cryptography-learning-acceptance`, with `WEB_HTTP_PORT=18000`.
The existing locally built image served the frontend at `http://127.0.0.1:18000`.
After adding catalog entries, the local container was recreated to reload configuration.
No `/query` interception was used for served tests.

## Checks

- Existing Lesson validator passed AES input/schedule/encryption/decryption dry-run.
- Existing Lesson validator passed all four comparison scenarios, including plaintext,
  round-key, ciphertext, and decryption round-key comparisons.
- `BASELINE_BASE_URL=http://127.0.0.1:18000 python3 -m unittest discover -s baseline/tests -p test_graphql.py`: 7 passed, including catalog order and valid/missing/traversal assets.
- `fish -lc 'cd frontend; nvm use; npm run typecheck && npm test -- --maxWorkers=1'`: typecheck passed; 15 test files and 209 tests passed outside sandbox child-process restrictions.
- `fish -lc 'cd frontend; nvm use; env PLAYWRIGHT_BASE_URL=http://127.0.0.1:18000 npx playwright test e2e/learning.spec.ts --project=chromium'`: 4 passed, 3 explicitly synthetic-only tests skipped.
- Final focused AES screenshot-framing rerun: 1 passed.
- Final comparison output-checkpoint rerun: 1 passed, including baseline ciphertext,
  distinct changed ciphertext, more than one differing output bit, and selected input bit.

The browser asserts the literal FIPS ciphertext
`69c4e0d86a7b0430d8cdb78070b4c55a`, with key
`000102030405060708090a0b0c0d0e0f` and plaintext
`00112233445566778899aabbccddeeff`. The served document binds all eleven
round keys explicitly to the standalone expansion Step. Expected ciphertext is
literal, not computed by the test. Comparison uses the existing round-key
constants and preserves the distinction between round-key changes and master-key expansion.

## Actual screenshot inspection

Screenshots were opened with the local image viewer, not merely captured.

- AES encryption/closed overlay: title, fixed ciphertext and plaintext row are readable;
  semantic rows and bit lineage are present. The wide matrix uses scrolling.
- AES open overlay: selected round key 0, `Close key expansion`, and the green
  schedule lane with input bits are visible. The close action returns to cipher view.
- Comparison selection: baseline/changed plaintext values are readable in one aligned
  checkpoint; bit 0 is selected and visibly differs (`0|1`), with its lineage emphasized.
- Malformed content: the localized YAML diagnostic is readable and global Learning
  navigation remains visible. The served test proceeds to the unknown Lesson afterward.
- The previously inspected substitution input screenshot showed readable Chinese title,
  plaintext/key controls, Preserve policy, direction, and navigation.

The dense AES/comparison matrices extend beyond the viewport. These observations
establish the inspected desktop flow only; they do not claim a mobile or release-level
visual gate. Release acceptance remains issue 80.
