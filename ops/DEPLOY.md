# Deploy: Vultr VM `inmywords-vm`

Ported from the Two Worlds setup in `agentic-social-research/ops/`, adapted for this repo's Python and Next.js stack.

## What runs where

One Vultr Cloud Compute VM: `vc2-1c-2gb`, Toronto (`yto`), Ubuntu 24.04, with a 2 GB swapfile for `next build`. Every service runs as the `app` user on `127.0.0.1`. The code lives in `/srv/inmywords`, owned by root and read-only to the services.

| systemd unit | Port | What |
|---|---|---|
| `inmywords-mcp-profile` | 8101 | `mcp/profile_server.py` |
| `inmywords-mcp-memory` | 8102 | `mcp/memory_server.py` |
| `inmywords-mcp-actions` | 8103 | `mcp/actions_server.py` (approval gate, allowlisted actions) |
| `inmywords-mcp-emh` | 8104 | `mcp/emh_server.py` (mock) |
| `inmywords-api` | 8000 | FastAPI (`api/main.py`) via uvicorn. TTS cache in `/var/lib/inmywords/audio-cache` |
| `inmywords-web` | 3000 | `next start`. It calls the API server-side at `http://127.0.0.1:8000` |
| `inmywords-booking` | 8200 | `mock-booking/app.py`, the page that shows a booking landed |
| Caddy | 80/443 | `https://<ip-with-dashes>.sslip.io` → web, `https://api.<ip-with-dashes>.sslip.io` → API, `https://booking.<ip-with-dashes>.sslip.io` → mock booking page. Let's Encrypt certificates are automatic. |

To add a service, add it to `SERVICES`, the unit list and the `names` list in `deploy.sh`. In seed mode, `db/seed/.runtime.json` (action plans and bookings) is a symlink to `/var/lib/inmywords/runtime.json`, because the code directory is read-only. To use a real domain (for example Ahmed's GoDaddy one), point `@`, `api` and `booking` A records at the VM and deploy with `DEPLOY_DOMAIN=yourdomain.xyz`.

**Secrets**: `/etc/inmywords.env` (root:app 0640) is written from the allowlisted keys (`ENV_KEYS` in `deploy.sh`) of your local `.env`. The values are streamed over SSH stdin and never land in argv, logs or the synced tree. With no keys set, everything runs in mock/seed mode. `DATABASE_URL` switches the MCP servers from seed JSON to Tiger Data.

## First-time setup

```bash
# 1. Vultr console → Account → API: enable the API, add this machine's IP to Access Control.
#    Put VULTR_API_KEY=<key> in the repo-root .env (gitignored).
node ops/vultr.js check
node ops/vultr.js create --yes          # ≈ $10/month, billed hourly while it exists
node ops/vultr.js instances             # wait for status active; note the IP

# 2. Record the host and pin its SSH host key (CI refuses unknown host keys)
echo <ip> > ops/host
ssh-keyscan -t ed25519 <ip> > ops/known_hosts   # check the fingerprint against the Vultr console if you can

# 3. Deploy
ops/deploy.sh
```

SSH keys, all made locally:

- `~/.ssh/inmywords_vultr_ed25519` is the operator key, uploaded to Vultr by `vultr.js create`.
- `~/.ssh/inmywords_github_deploy` is the CI key. Its public half is `ops/github_deploy_key.pub`, which `deploy.sh` installs as a `restrict` line in root's `authorized_keys`.

## Automatic deployment from GitHub

[`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) runs the backend tests and the web tests and build on every PR and push. A passing push to `main`, or **Run workflow** on `main`, then runs `ops/deploy.sh --skip-env`. That flag leaves the VM's secrets alone, so GitHub never holds an API key. The workflow then checks that `https://api.<host>.sslip.io/` reports the pushed `git_sha`.

It needs one repository secret, **`VULTR_DEPLOY_SSH_KEY`**: the contents of `~/.ssh/inmywords_github_deploy`, the private half. A repo admin adds it:

```bash
gh secret set VULTR_DEPLOY_SSH_KEY --repo Chuckyecheesy/InMyWords < ~/.ssh/inmywords_github_deploy
```

Without the secret, `ops/host` or `ops/known_hosts`, the deploy job reports "Deploy skipped" and leaves the VM alone.

Anyone who can push a workflow to this repo can read that secret and get root on the VM. To revoke it, delete the secret and run:

```bash
ssh -i ~/.ssh/inmywords_vultr_ed25519 root@$(cat ops/host) "sed -i '/inmywords-github-actions-deploy/d' /root/.ssh/authorized_keys"
```

Also remove `ops/github_deploy_key.pub`, or the next deploy adds the key back. Don't run a manual deploy and a CI deploy at the same time.

## Redeploy and operate

```bash
ops/deploy.sh               # sync, push .env secrets, build, restart, Caddy, verify
ops/deploy.sh --skip-env    # code only; keep the VM's secrets (what CI runs)
ops/deploy.sh --env-only    # you changed .env: push secrets and restart
ops/deploy.sh --plain-http  # if Let's Encrypt issuance fails

ssh -i ~/.ssh/inmywords_vultr_ed25519 root@$(cat ops/host) journalctl -u inmywords-api -f
```

## Destroy after the event

```bash
node ops/vultr.js instances
node ops/vultr.js destroy <instance-id> --yes
```

A stopped instance still bills, so destroy it.
