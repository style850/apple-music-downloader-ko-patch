# Native patch Go dependency notices

This record covers only the Go modules embedded in `electron/bin/amdl-service.exe` for the Korean native patch. It was captured with Go 1.27.3 from the local, already-built service binary:

```text
go version -m electron/bin/amdl-service.exe
```

The binary reports `CGO_ENABLED=0`, `GOOS=windows`, `GOARCH=amd64`, and `-trimpath=true`. It reports the following 32 non-main modules. Each module's top-level `LICENSE`, `NOTICE`, or `COPYING` file was copied verbatim from the matching local Go module cache into `.artifacts/release/licenses/go/<module>/<version>/`.

| Module | Version |
| --- | --- |
| github.com/AlecAivazis/survey/v2 | v2.3.7 |
| github.com/Eyevinn/mp4ff | v0.46.0 |
| github.com/aead/cmac | v0.0.0-20160719120800-7af84192f0b1 |
| github.com/beevik/etree | v1.3.0 |
| github.com/dustin/go-humanize | v1.0.1 |
| github.com/fatih/color | v1.18.0 |
| github.com/gorilla/mux | v1.8.1 |
| github.com/grafov/m3u8 | v0.11.1 |
| github.com/kballard/go-shellquote | v0.0.0-20180428030007-95032a82bc51 |
| github.com/mattn/go-colorable | v0.1.13 |
| github.com/mattn/go-isatty | v0.0.20 |
| github.com/mattn/go-runewidth | v0.0.9 |
| github.com/mgutz/ansi | v0.0.0-20200706080929-d51e80ef957d |
| github.com/mitchellh/colorstring | v0.0.0-20190213212951-d06e56a500db |
| github.com/ncruces/go-strftime | v0.1.9 |
| github.com/olekukonko/tablewriter | v0.0.5 |
| github.com/remyoudompheng/bigfft | v0.0.0-20230129092748-24d4a6f8daec |
| github.com/rivo/uniseg | v0.4.7 |
| github.com/schollz/progressbar/v3 | v3.14.6 |
| github.com/spf13/pflag | v1.0.5 |
| github.com/zhaarey/go-mp4tag | v0.0.0-20250210094042-22578afc09bf |
| golang.org/x/exp | v0.0.0-20250106191152-7588d65b2ba8 |
| golang.org/x/sys | v0.31.0 |
| golang.org/x/term | v0.28.0 |
| golang.org/x/text | v0.21.0 |
| google.golang.org/protobuf | v1.36.2 |
| gopkg.in/yaml.v2 | v2.2.8 |
| lukechampine.com/frand | v1.5.1 |
| modernc.org/libc | v1.61.13 |
| modernc.org/mathutil | v1.7.1 |
| modernc.org/memory | v1.8.2 |
| modernc.org/sqlite | v1.36.3 |

The Go 1.27.3 SDK `LICENSE` used to build this binary is copied at `.artifacts/release/licenses/go/go1.27.3/LICENSE`.

## Scope limits

- This is a binary-derived dependency inventory, not a complete `go.mod` or test-dependency inventory. Modules present only for tests are deliberately excluded.
- The source module `github.com/Andrew05213/applemusic_downloader` is the application being patched, not a third-party dependency in this notice set.
- No Apple, QEMU, runtime, emulator, or network-downloaded materials were copied: those components are not included in this distribution.
- License texts are copied from the local cache as evidence. This record does not classify licenses or give legal advice.
