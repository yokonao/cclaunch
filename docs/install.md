# Install

cclaunch is a single binary for macOS and Linux. Install it into a directory in your `PATH` in one of these ways:

1. [GitHub Releases](#github-releases)
1. [mise](#mise)
1. [go install](#go-install)

## GitHub Releases

Download the archive for your platform from [GitHub Releases](https://github.com/yokonao/cclaunch/releases), then install the binary into `PATH`:

```sh
asset=cclaunch_darwin_arm64.tar.gz # or cclaunch_{darwin,linux}_{amd64,arm64}.tar.gz
gh release download -R yokonao/cclaunch -p "$asset" # the latest release; pass a tag for another
tar -xzf "$asset" cclaunch
mkdir -p ~/.local/bin
install -m 755 cclaunch ~/.local/bin/
```

The macOS binaries are not notarized. `gh` and `curl` do not mark downloads as quarantined, but a browser does, and macOS then refuses to run the binary; remove the mark with `xattr -d com.apple.quarantine cclaunch`.

### Verify the archive

Each archive has a [build provenance attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) from the release workflow. Verify it with the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify "$asset" \
  -R yokonao/cclaunch \
  --signer-workflow yokonao/cclaunch/.github/workflows/release.yml
```

## mise

With [mise](https://mise.jdx.dev/):

```sh
mise use -g github:yokonao/cclaunch
```

mise verifies the [build provenance attestation](#verify-the-archive) automatically.

## go install

With Go 1.27.1 or later:

```sh
go install github.com/yokonao/cclaunch/cmd/cclaunch@latest
```

The binary lands in `$(go env GOBIN)`, or `~/go/bin` when that is unset.
