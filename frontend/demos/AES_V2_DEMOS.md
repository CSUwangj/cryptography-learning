# Runnable AES v2 Lessons

From the repository root, use the pinned Node version and existing dependencies:

```sh
fish -lc 'cd frontend; and nvm use; and npm run demos -- --host 127.0.0.1 --port 4178'
```

Open `http://127.0.0.1:4178/learning` for the bilingual AES catalog, or open a Lesson directly:

- `/learning/aes128-v2-kat?lang=en-US`
- `/learning/aes192-v2-kat?lang=en-US`
- `/learning/aes256-v2-kat?lang=en-US`

Use `lang=zh-CN` or the Shell language control for Chinese. The Shell also supplies the existing light/dark theme control.

Each Lesson starts with independently selectable full key-schedule states. **Next** opens encryption; the toolbar or a bound row opens the complete covering schedule. The cipher and schedule have independent selection units, including bit, nibble, byte and word. Related groups follow exact compiled bit dependencies without displaying partial-bit fractions or a detail panel.

AES-128 has one further **Next** step for the specified inverse case: the FIPS ciphertext recovers `00112233445566778899aabbccddeeff`, consuming the same schedule from rk10 to rk0. The covering blocks reverse consumption order while retaining each block's generation order and source identities. Expand **Original generation order** to inspect the original-order values.

These public calculation fixtures use the production Shell, LearningPage, BrowserLessonSession, RenderHost and module Worker. Only the catalog/document service is supplied locally; no backend or private content is required. The AES-192 fixture is retained. Existing `/testaescipher`, `/testaesavalanche`, `/testspn`, `/testavalanche` and `/testkeyexpansion` destinations remain available, with an AES v2 catalog link in their navigation.
