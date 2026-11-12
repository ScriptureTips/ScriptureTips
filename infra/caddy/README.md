# The development stack's reverse proxy

Caddy serves the development stack as `https://dev.scripturetips.com` (the web app) and `https://dev.scripture.tips` (the data server). See the [Caddyfile](Caddyfile) and `./dev`. Both names have public DNS records pointing at the development machine's private address, so Let's Encrypt can't reach them to check them over HTTP. Instead, certificates are issued by the **DNS check**, through **acme-dns** on the VPS:

1. Each site's `_acme-challenge` name is a CNAME into `acme.scripture.tips`, a zone delegated to acme-dns on the VPS.
2. Dev Caddy (built with the `acmedns` plugin, [infra/docker/caddy](../docker/caddy/Dockerfile)) sets the TXT record there through acme-dns's API, and Let's Encrypt reads it.
3. Caddy renews the certificates itself and keeps them in the `caddy-data` volume.

The development machine's own address is never published. Until the setup below is done, `./dev` uses a self-signed certificate instead ([tls-self-signed.caddy](tls-self-signed.caddy)).

## One-off setup

`159.195.34.34` is the VPS.

**On the VPS (Ansible):** run acme-dns (`joohoi/acme-dns`, a release that has been out for a while, v2.0.2 at the time of writing):

- **DNS:** published on the VPS's public address only, `159.195.34.34:53` UDP and TCP (systemd-resolved holds 127.0.0.53:53), and open in the firewall.
- **`config.cfg`:**
  - `domain = "acme.scripture.tips"`
  - `nsname = "acme-ns.scripture.tips"`
  - `records = ["acme.scripture.tips. A 159.195.34.34", "acme.scripture.tips. NS acme-ns.scripture.tips."]`
  - The API on plain HTTP inside Docker (`tls = "none"`), behind the production Caddy.
- **The API site:** `https://acme-ns.scripture.tips` proxies to acme-dns's API. Caddy gets that site's certificate the ordinary way.
- **Registration:** `disable_registration = false` until the account below is registered, then `true`.
- **Data:** keep its SQLite database in a volume and include it in the backups.

**At Namecheap:**

| Zone | Type | Host | Value |
|---|---|---|---|
| scripture.tips | A | `acme-ns` | `159.195.34.34` |
| scripture.tips | NS | `acme` | `acme-ns.scripture.tips.` |
| scripture.tips | CNAME | `_acme-challenge.dev` | `{subdomain}.acme.scripture.tips.` |
| scripturetips.com | CNAME | `_acme-challenge.dev` | `{subdomain}.acme.scripture.tips.` |

**The account, once:** `curl -X POST https://acme-ns.scripture.tips/register`. Put `{subdomain}` from the answer into both CNAMEs. One account serves both names (acme-dns keeps the two latest TXT values). Then save the credentials as `.dev-certs/acme-dns.json`, which is never committed:

```json
{
  "username": "…",
  "password": "…",
  "subdomain": "…",
  "server_url": "https://acme-ns.scripture.tips"
}
```

**Then** run `./dev up --lan`. When `.dev-certs/acme-dns.json` exists, `./dev` switches Caddy to [tls-acme-dns.caddy](tls-acme-dns.caddy), and `./dev logs caddy` shows the certificates being obtained.

**Checking:** `dig +short TXT _acme-challenge.dev.scripturetips.com` follows the CNAME to acme-dns (empty until a check is running), and `dig +short NS acme.scripture.tips` names `acme-ns.scripture.tips`.
