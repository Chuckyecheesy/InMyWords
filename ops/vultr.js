#!/usr/bin/env node
/* Vultr account helper for In My Words (ported from agentic-social-research/ops/vultr.js).
 * Zero dependencies (Node 22).
 *
 * Reads VULTR_API_KEY (account API key) from the environment or the repo-root
 * .env file (a human writes that one line). The key is never printed or written
 * anywhere else. Commands that create or destroy billable resources need --yes.
 *
 *   node ops/vultr.js check                      account balance, key permissions, existing instances
 *   node ops/vultr.js plans [region]             cheapest CPU plans in a region (default yto, Toronto)
 *   node ops/vultr.js instances                  list instances
 *   node ops/vultr.js create [--region yto] [--plan vc2-1c-2gb] [--yes]
 *                                                create one Ubuntu 24.04 VM with the local deploy SSH key
 *   node ops/vultr.js resize <instance-id> <plan> [--yes]
 *                                                in-place plan upgrade (the VM reboots; disk is kept)
 *   node ops/vultr.js destroy <instance-id> --yes
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env');
const API = 'https://api.vultr.com/v2';
const LABEL = 'inmywords';
const DEPLOY_KEY = path.join(os.homedir(), '.ssh', 'inmywords_vultr_ed25519.pub');

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const out = {};
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

const fileEnv = readEnvFile();
const env = (k) => process.env[k] || fileEnv[k] || '';
const args = require.main === module ? process.argv.slice(2) : [];
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); return i >= 0 && args[i + 1] ? args[i + 1] : fallback; };

async function vultr(method, route, body) {
  const key = env('VULTR_API_KEY');
  if (!key) {
    throw new Error('VULTR_API_KEY is missing. Create it in the Vultr console (Account → API → Enable API), then add VULTR_API_KEY=<key> to .env in the repo root.');
  }
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 300) }; }
  if (!res.ok) {
    const detail = data?.error || data?.raw || res.statusText;
    const hint = res.status === 401 ? ' (check the key, and that this machine\'s IP is in Account → API → Access Control)' : '';
    throw new Error(`Vultr ${method} ${route} → HTTP ${res.status}: ${detail}${hint}`);
  }
  return data;
}

async function publicIp() {
  try { return (await (await fetch('https://api.ipify.org', { signal: AbortSignal.timeout(5000) })).text()).trim(); } catch { return 'unknown'; }
}

async function check() {
  const { account } = await vultr('GET', '/account');
  console.log('Vultr API key: valid');
  console.log(`  balance: ${account.balance} USD (negative means credit), pending charges: ${account.pending_charges} USD`);
  console.log(`  key permissions: ${(account.acls || []).join(', ') || 'none listed'}`);
  console.log(`  this machine's public IP: ${await publicIp()}`);
  const { instances = [] } = await vultr('GET', '/instances');
  console.log(`  instances: ${instances.length ? instances.map((i) => `${i.label} ${i.main_ip} ${i.status}`).join('; ') : 'none'}`);
}

async function plans() {
  const region = args[1] && !args[1].startsWith('--') ? args[1] : 'yto';
  const { plans: all = [] } = await vultr('GET', '/plans?type=all&per_page=500');
  const here = all.filter((p) => (p.locations || []).includes(region) && !/gpu/i.test(p.type || '') && p.vcpu_count <= 4)
    .sort((a, b) => a.monthly_cost - b.monthly_cost).slice(0, 12);
  if (!here.length) { console.log(`No CPU plans listed for region ${region}.`); return; }
  console.log(`Cheapest CPU plans in ${region}:`);
  for (const p of here) console.log(`  ${p.id.padEnd(22)} ${p.vcpu_count} vCPU  ${(p.ram / 1024).toFixed(1)} GB RAM  ${p.disk} GB  $${p.monthly_cost}/mo (~$${(p.monthly_cost / 730).toFixed(3)}/h)`);
}

async function instances() {
  const { instances: list = [] } = await vultr('GET', '/instances');
  if (!list.length) { console.log('No instances.'); return; }
  for (const i of list) console.log(`${i.id}  ${i.label}  ${i.region}  ${i.plan}  ${i.main_ip}  ${i.status}/${i.power_status}`);
}

async function ensureSshKey() {
  if (!fs.existsSync(DEPLOY_KEY)) throw new Error(`Deploy key ${DEPLOY_KEY} is missing. Create it with: ssh-keygen -t ed25519 -N "" -C ${LABEL} -f ${DEPLOY_KEY.replace(/\.pub$/, '')}`);
  const pub = fs.readFileSync(DEPLOY_KEY, 'utf8').trim();
  const { ssh_keys: keys = [] } = await vultr('GET', '/ssh-keys');
  const existing = keys.find((k) => k.ssh_key.trim() === pub);
  if (existing) return existing.id;
  return (await vultr('POST', '/ssh-keys', { name: `${LABEL}-deploy`, ssh_key: pub })).ssh_key.id;
}

async function create() {
  const region = option('region', 'yto');
  const plan = option('plan', 'vc2-1c-2gb');
  const { os: systems = [] } = await vultr('GET', '/os?per_page=500');
  const ubuntu = systems.filter((o) => /^Ubuntu 24\.04/.test(o.name) && o.arch === 'x64')[0] || systems.find((o) => /^Ubuntu/.test(o.name) && o.arch === 'x64');
  if (!ubuntu) throw new Error('No Ubuntu x64 image found');
  const { plans: all = [] } = await vultr('GET', '/plans?type=all&per_page=500');
  const chosen = all.find((p) => p.id === plan);
  if (!chosen) throw new Error(`Unknown plan ${plan}; run: node ops/vultr.js plans ${region}`);
  if (!(chosen.locations || []).includes(region)) throw new Error(`Plan ${plan} is not offered in ${region}`);
  console.log(`Plan: ${plan} in ${region}, ${ubuntu.name}, $${chosen.monthly_cost}/mo (~$${(chosen.monthly_cost / 730).toFixed(3)}/h, billed while it exists, even when stopped).`);
  if (!flag('yes')) { console.log('Re-run with --yes to create it.'); return; }
  const sshkey = await ensureSshKey();
  const userData = Buffer.from([
    '#!/bin/bash',
    'set -eux',
    'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -',
    'apt-get install -y nodejs rsync python3-venv python3-pip',
    'useradd -m -s /usr/sbin/nologin app || true',
    'fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab || true',
    'ufw allow 22/tcp || true',
    'ufw allow 80/tcp || true',
    'ufw allow 443/tcp || true',
  ].join('\n')).toString('base64');
  const { instance } = await vultr('POST', '/instances', { region, plan, os_id: ubuntu.id, label: `${LABEL}-vm`, hostname: `${LABEL}-vm`, sshkey_id: [sshkey], user_data: userData, backups: 'disabled', enable_ipv6: false, tags: [LABEL] });
  console.log(`Created instance ${instance.id} (${instance.label}). It takes 1–3 minutes to boot; run: node ops/vultr.js instances`);
}

async function resize() {
  const [id, plan] = [args[1], args[2]];
  if (!id || !plan || id.startsWith('--') || plan.startsWith('--')) throw new Error('Usage: node ops/vultr.js resize <instance-id> <plan> --yes');
  const { instance } = await vultr('GET', `/instances/${id}`);
  const { upgrades } = await vultr('GET', `/instances/${id}/upgrades?type=plans`);
  if (!(upgrades.plans || []).includes(plan)) throw new Error(`${plan} is not an available upgrade for ${instance.plan}`);
  const all = (await vultr('GET', '/plans?type=all&per_page=500').catch(() => ({}))).plans || [];  // price is informational
  const chosen = all.find((p) => p.id === plan);
  console.log(`Resize ${instance.label} ${instance.plan} -> ${plan} ($${chosen?.monthly_cost}/mo). The VM reboots for a few minutes; disk and IP are kept.`);
  if (!flag('yes')) { console.log('Re-run with --yes to resize it.'); return; }
  await vultr('PATCH', `/instances/${id}`, { plan });
  console.log('Resize requested. Run: node ops/vultr.js instances');
}

async function destroy() {
  const id = args[1];
  if (!id || id.startsWith('--')) throw new Error('Usage: node ops/vultr.js destroy <instance-id> --yes');
  const { instance } = await vultr('GET', `/instances/${id}`);
  console.log(`Instance ${instance.id} ${instance.label} ${instance.main_ip} ${instance.status}`);
  if (!flag('yes')) { console.log('Re-run with --yes to destroy it permanently.'); return; }
  await vultr('DELETE', `/instances/${id}`);
  console.log('Destroyed.');
}

module.exports = { vultr, readEnvFile };

if (require.main === module) {
  const commands = { check, plans, instances, create, resize, destroy };
  const command = commands[args[0]];
  if (!command) {
    const lines = fs.readFileSync(__filename, 'utf8').split('\n');
    console.log(lines.slice(2, lines.findIndex((l) => l.trim() === '*/')).join('\n').replace(/^ \* ?/gm, ''));
    process.exitCode = args[0] ? 2 : 0;
  } else {
    command().catch((error) => { console.error(String(error.message || error)); process.exitCode = 1; });
  }
}
