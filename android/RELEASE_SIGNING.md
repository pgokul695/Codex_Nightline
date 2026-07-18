# Android release signing

Android updates must use the same signing key. Keep the resulting keystore and its passwords in a secure password manager or secret store; losing it prevents future updates from using the same app identity.

Generate the keystore once from the repository root:

```bash
keytool -genkeypair -v \
  -keystore android/schedger-release.keystore \
  -alias schedger \
  -keyalg RSA -keysize 4096 -validity 10000
```

The command prompts for the keystore password, key password, and certificate identity. Do not commit the `.keystore` file or passwords.

Copy `android/keystore.properties.example` to `android/keystore.properties` and set:

```properties
storeFile=../schedger-release.keystore
storePassword=your-keystore-password
keyAlias=schedger
keyPassword=your-key-password
```

Alternatively, set these environment variables: `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.

Build signed release artifacts:

```bash
cd android
./gradlew assembleRelease bundleRelease
```

The APK is written to `app/build/outputs/apk/release/` and the AAB to `app/build/outputs/bundle/release/`.
