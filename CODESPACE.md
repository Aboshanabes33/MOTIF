```sh
git stash push -u -m "before-motif-update"
git switch main
git pull --ff-only
nvm install 24
nvm use 24
corepack enable
pnpm install --frozen-lockfile
pnpm run build --serial &&
pnpm dsh web --no-open --trusted-host "${CODESPACE_NAME}-3080.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
```

Ports -> 3080 -> Private -> Open in Browser. Run the server only after the build succeeds.
