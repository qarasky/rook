{
  description = "Rook: Tauri GUI around the GitHub CLI";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
      lib = pkgs.lib;
    in {
      packages.${system}.default = pkgs.rustPlatform.buildRustPackage (finalAttrs: {
        pname = "rook";
        version = "0.1.0";

        # Only git-tracked files are part of a flake source, so node_modules/target are not.
        src = ./.;

        cargoLock.lockFile = ./src-tauri/Cargo.lock;
        cargoRoot = "src-tauri";
        buildAndTestSubdir = finalAttrs.cargoRoot;

        npmDeps = pkgs.fetchNpmDeps {
          name = "${finalAttrs.pname}-npm-deps-${finalAttrs.version}";
          inherit (finalAttrs) src;
          hash = "sha256-IA3tm9wXHaC9jCC4QkbyAtEiWCiFH7FpJu6LCqIx+dM=";
        };

        nativeBuildInputs = with pkgs; [
          cargo-tauri.hook
          nodejs
          npmHooks.npmConfigHook
          pkg-config
          wrapGAppsHook3
        ];

        buildInputs = with pkgs; [
          glib-networking
          gtk3
          libsoup_3
          openssl
          webkitgtk_4_1
        ];

        # Rook shells out to gh and git, so they must be on its PATH.
        preFixup = ''
          gappsWrapperArgs+=(
            --prefix PATH : ${lib.makeBinPath [ pkgs.gh pkgs.git ]}
            --set ROOK_NO_UPDATE_CHECK 1
          )
        '';

        meta = {
          description = "Desktop GUI for the GitHub CLI";
          mainProgram = "rook";
          platforms = [ system ];
        };
      });

      apps.${system}.default = {
        type = "app";
        program = "${self.packages.${system}.default}/bin/rook";
      };

      devShells.${system}.default = pkgs.mkShell {
        nativeBuildInputs = with pkgs; [
          pkg-config
          cargo
          rustc
          rustfmt
          clippy
          nodejs_24
          gobject-introspection
          cargo-tauri
          (python3.withPackages (ps: [ ps.pillow ]))
        ];
        buildInputs = with pkgs; [
          webkitgtk_4_1
          gtk3
          libsoup_3
          glib
          cairo
          pango
          gdk-pixbuf
          atk
          librsvg
          openssl
          libayatana-appindicator
          gh
          git
        ];
        shellHook = ''
          export XDG_DATA_DIRS="${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:$XDG_DATA_DIRS"
          export LD_LIBRARY_PATH="${pkgs.lib.makeLibraryPath [ pkgs.libayatana-appindicator ]}:$LD_LIBRARY_PATH"
        '';
      };
    };
}
