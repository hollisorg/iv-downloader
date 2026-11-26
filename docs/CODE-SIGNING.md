# Code signing

## Windows release builds

Sign in to the Hollis Organization tenant with Azure CLI, using an account with the
Artifact Signing Certificate Profile Signer role on the iv-windows certificate profile.
Install the Windows SDK (22621 or newer, with x64 SignTool) and the .NET 10 x64 runtime.
Run `npm run dist:win-release` to build and verify Windows release assets in `dist/`.

The scripts sign Windows executables and the NSIS installer before Electron Builder generates
the updater manifest and blockmap. The build verifies the Hollis Organization Inc publisher,
the Microsoft timestamp, and the installer checksum in the manifest.

Tagged Windows release jobs use Azure login with GitHub OIDC. The `windows-signing` environment
allows only `v*` tags. It supplies `IV_SIGNING_AZURE_CLIENT_ID` and `IV_SIGNING_AZURE_TENANT_ID`
as GitHub Actions variables. The federated credential matches this repository’s immutable GitHub
subject and the environment. Its Azure Signer role applies only to the `iv-windows` profile.
A Windows release job stops on any authentication, signing, or verification failure.

## macOS: Apple Developer ID

Until the Mac app is signed with a Developer ID and notarized by Apple, the release workflow
publishes it **ad-hoc signed** (when `ALLOW_UNSIGNED` is `true`). It runs, but:

- macOS blocks the first open with *"Apple could not verify IV Downloader is free of malware"*.
  People click **Done**, then open **System Settings → Privacy & Security**, scroll down and click
  **Open Anyway** next to IV Downloader. This only has to happen once.
- The app can't update itself. It shows **Get vX ↗** in the status bar, which opens the release page.

Signing and notarizing removes both. It needs a paid **Apple Developer Program** membership
(individual or organization; check the current price at developer.apple.com/programs). An organization
membership needs a D-U-N-S number and shows the business name.

### Steps (you do these; they need your Apple account and payment)

1. **Join the Apple Developer Program** at developer.apple.com/programs/enroll. Note the **Team ID**
   (Membership details).
2. **Create a Developer ID Application certificate.** On a Mac, in Xcode → Settings → Accounts →
   Manage Certificates → **+** → *Developer ID Application*. (Without a Mac: create a certificate
   signing request with OpenSSL and upload it at developer.apple.com → Certificates.)
3. **Export it as a .p12** with a password (Keychain Access → right-click the certificate → Export).
   Base64-encode the file: `base64 -i cert.p12 | pbcopy` on a Mac, or
   `[Convert]::ToBase64String([IO.File]::ReadAllBytes('cert.p12'))` in PowerShell.
4. **App-specific password** for notarization: appleid.apple.com → Sign-In and Security →
   App-Specific Passwords.

### Hand-off to the repository

Secrets (*Settings → Secrets and variables → Actions*):
| Name | Value |
|---|---|
| `MAC_CERT_P12_BASE64` | The base64 text of the .p12 |
| `MAC_CERT_PASSWORD` | The .p12 export password |
| `APPLE_ID` | The Apple ID email of the developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | The app-specific password |
| `APPLE_TEAM_ID` | The Team ID |

The next tagged release then signs and notarizes both Mac builds. After that, flip `MANUAL` in
`src/main/updater.js` to `false` so Macs install updates themselves like Windows does.
