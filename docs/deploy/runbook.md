# Runbook — first-time setup of `amv.lefted.dev`

Ordered bring-up of this app on the single-node k3s VPS, from nothing to a
serving `https://amv.lefted.dev`. Run it once; afterwards the day-to-day loop is
one command and lives in [`deploys.md`](deploys.md).

## Who does what

| Marker         | Who                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| **[owner]**    | Moritz. Anything behind a login only he has: the Cloudflare dashboard, the Google Cloud console, the VPS. |
| **[operator]** | Whoever is at the laptop with the WireGuard tunnel and the `hygames` kube context — may be Moritz too.    |

An [operator] step needs no account anywhere; it is `kubectl`, `podman`, `ssh`
and this repo. An **[owner]** step cannot be delegated or scripted.

### Manual [owner] steps at a glance

1. Bring up the WireGuard tunnel `hygames-eu-vps` (§1).
2. Confirm the Cloudflare zone settings for `lefted.dev` (§2a) — SSL **Full
   (strict)** and **Always Use HTTPS**.
3. Confirm `amv.lefted.dev` resolves to Cloudflare (§2b). Nothing to create
   while the proxied wildcard record exists.
4. Create a server-side **YouTube Data API v3** key (§3).
5. Fill in `deploy/k8s/secrets.env` — the Postgres password, the API key, and
   the bootstrap admin email + password (§3).
6. Everything else is [operator].

If the Cloudflare API token ever has to be re-created, that is an [owner] step
too — see §6.

## What already exists on the cluster

Do not re-create these; other apps depend on them.

| Thing                                | State                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------- |
| k3s v1.35, single node, Debian 13    | Node IP `173.249.49.11`; kube context `hygames` over the tunnel at `10.77.0.1`.           |
| cert-manager                         | Installed, in namespace `cert-manager`.                                                   |
| ClusterIssuer `letsencrypt-lefted`   | **Ready**, Let's Encrypt production, Cloudflare DNS-01 scoped to `lefted.dev`. See §6.    |
| Secret `cloudflare-lefted-api-token` | In namespace `cert-manager`, key `api-token`. Consumed by the issuer above.               |
| Traefik                              | k3s's built-in, on `:80` and `:443`.                                                      |
| Private registry                     | Namespace `registry`, bound to `127.0.0.1:5000` on the VPS. Pushed to over an SSH tunnel. |
| Cloudflare zone `lefted.dev`         | Active, nameservers `corey`/`liz.ns.cloudflare.com`, proxied wildcard DNS record.         |
| StorageClass `local-path-retain`     | local-path provisioner with `reclaimPolicy: Retain`. The Postgres PVC uses it.            |

---

## 1. [owner] Tunnel, then [operator] check the context

Admin traffic to the VPS goes through WireGuard; there is no public SSH or kube
API port. Bring the tunnel up first — nothing below works without it.

**[owner]** Activate the WireGuard tunnel `hygames-eu-vps`.

**[operator]** Confirm you are pointed at the right cluster:

```sh
kubectl config current-context     # expect: hygames
kubectl get nodes                  # expect: one Ready node, k3s v1.35
```

If `kubectl` hangs, the tunnel is down.

## 2. [owner] Cloudflare

### 2a. Zone settings

Cloudflare → `lefted.dev`:

- **SSL/TLS → Overview** → encryption mode **Full (strict)**. _Flexible_ sends
  plain HTTP to the origin and loops against our HTTPS redirect; plain _Full_
  encrypts but validates nothing.
- **SSL/TLS → Edge Certificates** → **Always Use HTTPS** on. Cloudflare then
  301s plaintext at the edge, before it ever reaches Traefik. The Traefik
  Middleware in `ingress.yaml` stays as the backstop for anything that does not
  go through the edge.

Both are zone-wide and already set for the other `lefted.dev` apps — this is a
verification step, not a change.

> Fallback, only if the zone itself is ever gone from Cloudflare: **disable
> DNSSEC at the registrar first** and wait for the DS records' TTL to expire,
> then add the site at Cloudflare (Free plan) and point the registrar's
> authoritative nameservers at the two Cloudflare ones. Switching the
> nameservers while DNSSEC is still on breaks resolution for the whole domain:
> resolvers refuse Cloudflare's answers because the DS records at the registry
> still name the old signing keys.

### 2b. DNS

There is a **proxied wildcard record** on the zone, so `amv.lefted.dev` already
resolves. Verify rather than create:

```sh
nslookup amv.lefted.dev
```

Expect two Cloudflare IPs (`104.21.x.x` / `172.67.x.x`), **not** `173.249.49.11`
— seeing the origin IP means the record is not proxied and the origin is
exposed.

> Fallback, only if the wildcard is ever removed: Cloudflare → **DNS →
> Records** → add `A` `amv` → `173.249.49.11`, proxy status **Proxied**
> (orange).

## 3. [owner] Gather the secret values

The credentials never enter git. Collect them now so the [operator] step below
is one paste:

- **Postgres password** — generate with `openssl rand -hex 24`. Use that form:
  it is alphanumeric, so the raw value and the value inside `DATABASE_URL` are
  identical and cannot drift through percent-encoding.
- **`YOUTUBE_API_KEY`** — Google Cloud console → **APIs & Services →
  Credentials → Create credentials → API key**, with **YouTube Data API v3**
  enabled for the project. Restrict the key to that API. Do **not** add an HTTP
  referrer restriction: this key is used server-side, and a referrer
  restriction would reject every call.
- **`ADMIN_EMAIL` / `ADMIN_PASSWORD`** — the first account, created on boot
  against an empty users table. Sign-up is invite-only afterwards, so this is
  the only way in.

## 4. [operator] Namespace and Secrets

Create the namespace first. `kubectl apply -f deploy/k8s/` would otherwise walk
the directory alphabetically and try to create namespaced objects before the
namespace exists.

```sh
kubectl apply -f deploy/k8s/namespace.yaml
```

Then the two Secrets, from a single gitignored file:

```sh
cp deploy/k8s/secrets.env.example deploy/k8s/secrets.env
# fill in the values from §3; DATABASE_URL must carry the same password as
# POSTGRES_PASSWORD
kubectl -n amv create secret generic postgres-credentials --from-env-file=deploy/k8s/secrets.env
kubectl -n amv create secret generic amv-env              --from-env-file=deploy/k8s/secrets.env
```

`--from-env-file` copies every key into both Secrets. That is deliberate — a
container only sees the Secret named in its own `envFrom`, and one file means
`POSTGRES_PASSWORD` and `DATABASE_URL` cannot drift apart.

> **`deploy/k8s/secrets.env` is the only copy of these credentials.** It is not
> in git, there is no backup, and losing the laptop loses them. The YouTube key
> and the admin password are re-creatable; the Postgres password is recoverable
> only while the volume survives and you can `exec` into the pod (see "Rotate the
> Postgres password").

To **update** a Secret later, `kubectl create secret` refuses to overwrite and
deleting it first leaves a window where a restarting pod finds nothing. Use the
dry-run → apply dance:

```sh
kubectl -n amv create secret generic amv-env \
  --from-env-file=deploy/k8s/secrets.env \
  --dry-run=client -o yaml | kubectl apply -f -
```

A Secret update changes **no running pod** — `envFrom` is resolved once, at
container start. It always needs a `rollout restart` to take effect.

## 5. [operator] Postgres

```sh
kubectl apply -f deploy/k8s/postgres.yaml
kubectl -n amv rollout status statefulset/postgres
```

`POSTGRES_PASSWORD` is consumed by `initdb` on this first boot and never again;
from here on the password lives in the database's own catalog — see "Rotate the
Postgres password".

## 6. [operator] The certificate

The ClusterIssuer is **shared infrastructure that already exists** — this repo
ships no ClusterIssuer manifest on purpose, so applying `deploy/k8s/` can never
overwrite an object the other `lefted.dev` apps depend on. Only the namespaced
Certificate is ours:

```sh
kubectl apply -f deploy/k8s/certificate.yaml
kubectl -n amv describe certificate lefted-wildcard
```

DNS-01 usually completes in one to three minutes. When it reports `Ready: True`
there is a Secret `lefted-wildcard-tls` in `amv` holding `tls.crt` + `tls.key`.

A TLS Secret is namespaced, so each namespace needs its own Certificate for the
same wildcard. `amv` having one is not a duplicate of the other apps' copies.

Normally one issues against Let's Encrypt **staging** first, because production
rate-limits failed issuances hard. That advice is about an _unproven_ issuer;
`letsencrypt-lefted` is already issuing for this zone, so go straight to
production. If issuance does fail, that is when to create a staging issuer,
point `issuerRef.name` in `certificate.yaml` at it, debug there, then switch
back and re-issue:

```sh
kubectl delete certificate lefted-wildcard -n amv
kubectl delete secret lefted-wildcard-tls -n amv
kubectl apply -f deploy/k8s/certificate.yaml
```

### The ClusterIssuer (shared, already exists)

**Reference only — do not apply this unless the issuer is genuinely gone.** It
is what is on the cluster today; the commented `server:` line is the staging
variant described above (give a staging copy a different `metadata.name` and
`privateKeySecretRef.name`).

```yaml
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-lefted
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    # server: https://acme-staging-v02.api.letsencrypt.org/directory # staging
    email: gartnermoritz@yahoo.de
    privateKeySecretRef:
      name: letsencrypt-lefted-account-key
    solvers:
      - dns01:
          cloudflare:
            apiTokenSecretRef:
              name: cloudflare-lefted-api-token
              key: api-token
        selector:
          dnsZones:
            - lefted.dev
```

It depends on Secret `cloudflare-lefted-api-token` in the **`cert-manager`**
namespace (the solver pod is what calls the Cloudflare API). If that token ever
has to be replaced: **[owner]** Cloudflare → **My Profile → API Tokens → Create
Token → Custom token**, permissions `Zone → DNS → Edit` **and**
`Zone → Zone → Read`, zone resources → include → specific zone → `lefted.dev`.
Then **[operator]**:

```sh
kubectl -n cert-manager create secret generic cloudflare-lefted-api-token \
  --from-literal=api-token=<token> --dry-run=client -o yaml | kubectl apply -f -
```

## 7. [operator] App and ingress

The Deployment carries a placeholder image tag that does not exist in the
registry yet, so apply the ingress now and let §9 bring up the app:

```sh
kubectl apply -f deploy/k8s/ingress.yaml
```

Applying `app.yaml` before the first image exists is harmless — the pods sit in
`ImagePullBackOff` until `scripts/deploy.sh` pushes a real tag — but there is
no reason to.

## 8. [operator] Registry tunnel and podman

The registry listens only on the VPS's loopback, so pushes go through an SSH
tunnel. Open it in its own terminal and leave it running:

```sh
ssh -N -L 5000:localhost:5000 hygames.eu
```

Podman runs inside a WSL2 machine with `networkingMode=mirrored`, so
`localhost` in the VM is `localhost` on Windows and the in-VM push reaches the
tunnel. Both that and the insecure-registry config are already set up on the
laptop; check rather than redo:

```sh
podman machine ssh -- curl -s http://localhost:5000/v2/
```

`{}` means mirrored networking, the tunnel and the insecure-registry trust are
all in place. An error means one of the three is not — if it is the last one:

```sh
echo '[[registry]]
location = "localhost:5000"
insecure = true' | podman machine ssh -- sudo tee //etc/containers/registries.conf.d/localhost.conf
podman machine stop && podman machine start
```

> The doubled slash in `//etc/...` is not a typo: MSYS would rewrite a leading
> single `/` into a Windows path, and Linux normalises `//etc` back to `/etc`.

The registry speaks plain HTTP. That is fine because the traffic only ever
crosses loopback on the VPS (when k3s pulls) and the SSH tunnel (when you push);
containerd auto-trusts `localhost:*`, so the cluster side needs no config.

## 9. [operator] First deploy

`HEAD` must be on `main`, clean, and pushed. Then:

```sh
bash scripts/deploy.sh --dry-run              # read the plan first
bash scripts/deploy.sh --bootstrap            # first deploy only
```

`--bootstrap` skips the preflight that reads the live `/api/v1/meta`; on the
first deploy nothing is serving the host yet, so there is no schema version to
compare against. Every deploy after this one drops the flag.

The script builds and pushes `localhost:5000/amv-tierlist:<sha>`, rewrites the
`image:` line in `deploy/k8s/app.yaml`, applies it, waits for the rollout,
verifies both endpoints and commits the bump locally. It never pushes git. The
full contract is in [`deploys.md`](deploys.md).

## 10. Verification checklist

```sh
kubectl -n amv get pods,svc,ingress
kubectl -n amv get certificate                     # lefted-wildcard  READY=True
curl -i https://amv.lefted.dev/healthz             # 200
curl -s https://amv.lefted.dev/api/v1/meta         # commit == the deployed SHA
curl -I http://amv.lefted.dev/healthz              # 301/308 -> https
```

In `/api/v1/meta`, `dbSchemaVersion` must equal `binarySchemaVersion` and
`startedAt` must be from the last few minutes.

Then, in a browser: `https://amv.lefted.dev` loads, and logging in with
`ADMIN_EMAIL` / `ADMIN_PASSWORD` works.

The certificate `curl -v` prints is **Cloudflare's**, not Let's Encrypt's —
expected with the proxy on. To see the origin certificate, bypass the edge:

```sh
curl -v --resolve amv.lefted.dev:443:173.249.49.11 https://amv.lefted.dev/healthz
```

## Rollback

In an emergency:

```sh
kubectl -n amv rollout undo deployment/amv-tierlist
```

That is seconds, and it leaves `app.yaml` naming an image that is no longer
running — so re-pin the previous SHA and commit as soon as the fire is out. The
full picture, including why you can never roll back to an image whose schema is
behind the live database, is in [`deploys.md`](deploys.md#rollback).

## Rotate the Postgres password

The trap: `POSTGRES_PASSWORD` in `postgres-credentials` is read by the Postgres
image only when `initdb` runs, i.e. on the first boot against an empty volume.
Rewriting that Secret — even followed by a restart — leaves the server's actual
password untouched. The password lives in the database's own catalog. And
nothing warns you: the readiness probe is `pg_isready`, which does not
authenticate, so a Secret that disagrees with the server stays green until
something opens a connection.

Treat steps 2–4 as a short planned outage and run them back to back: Postgres
checks the password at connection setup, so the old pods keep serving on
already-open connections, but every _new_ connection in that window fails.

1. Edit `deploy/k8s/secrets.env`: the new `POSTGRES_PASSWORD` **and** the same
   password inside `DATABASE_URL`. Re-read both lines.
2. Change it in the database — this works without the old password, because the
   container's unix socket is trusted locally. It is also the escape hatch if
   the password is ever lost entirely:

   ```sh
   kubectl -n amv exec -it postgres-0 -- psql -U amv
   ```

   ```sql
   ALTER USER amv WITH PASSWORD '<new password>';
   ```

3. Update both Secrets with the dry-run → apply dance (`amv-env` for the new
   `DATABASE_URL`, `postgres-credentials` so a future `initdb` agrees). Do
   **not** restart the StatefulSet; it already has the new password from step 2,
   and a restart only costs availability.
4. `kubectl -n amv rollout restart deployment/amv-tierlist` and wait for
   `rollout status`.
5. Verify with `/api/v1/meta`, not `/healthz`: `/healthz` is DB-free and would
   stay green with a broken credential, while `/api/v1/meta` opens a connection
   and therefore proves the new one authenticates.

If step 5 fails, go back into `psql` and `ALTER USER` to whatever `DATABASE_URL`
actually says — step 2 is idempotent and reversible — and only then sort out the
file.

## Backups

**There are none.** Same gap as CoSpace, stated plainly rather than implied:

- The Postgres PVC is not backed up anywhere. `storageClassName:
local-path-retain` means a deleted StatefulSet or PVC leaves the data on the
  node, which protects against a stray `kubectl delete` — it is **not** a
  backup. A failed disk, a corrupted database, or a wrong `DELETE` is
  unrecoverable.
- `deploy/k8s/secrets.env` has no second copy either.
- `lefted-wildcard-tls` needs no backup: delete it and cert-manager re-issues.

The obvious next step is a `CronJob` running `pg_dump` into a second volume, or
off the VPS entirely. That is a **follow-up ticket**, deliberately not in this
one. Until it exists, do not put anything in this app you would mind losing.

## Troubleshooting

| Symptom                                                                   | Likely cause                                                                                                                                                      |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kubectl` hangs                                                           | WireGuard tunnel down. Activate `hygames-eu-vps`.                                                                                                                 |
| `podman push` fails, connection refused                                   | SSH tunnel not running, or the podman machine is not on mirrored networking (§8).                                                                                 |
| Pods `ImagePullBackOff`                                                   | The tag in `app.yaml` was never pushed. Run `scripts/deploy.sh`, don't hand-edit the tag.                                                                         |
| Pods `CrashLoopBackOff` right after a deploy                              | Usually `DATABASE_URL`: check the percent-encoding of the password. `kubectl -n amv logs -l app=amv-tierlist`.                                                    |
| Rollout stalls, old pods keep serving                                     | Working as designed — the new pod never went Ready. Read its logs; nothing has been taken away from users.                                                        |
| `Certificate` stuck `Ready: False`                                        | Cloudflare token missing, expired or wrongly scoped (needs `Zone:DNS:Edit` **and** `Zone:Zone:Read`).                                                             |
| `ERR_TOO_MANY_REDIRECTS`                                                  | Cloudflare SSL mode is _Flexible_. Set **Full (strict)** (§2a).                                                                                                   |
| Cloudflare 521 / 522 / 525                                                | 521 origin down · 522 origin unreachable from Cloudflare (firewall) · 525 TLS handshake failed (certificate not issued yet, or SSL mode is not Full (strict)).    |
| HTTP does not redirect to HTTPS                                           | **Always Use HTTPS** off at the edge, or the Middleware annotation lost its namespace prefix (`amv-redirect-to-https@kubernetescrd`).                             |
| Traefik returns 404 on `:443`                                             | Host mismatch in the Ingress rule, or the `websecure` entrypoint is not exposed.                                                                                  |
| POSTs return 403                                                          | `ORIGIN` does not match the public URL. It is set in `app.yaml`, not in the Secret.                                                                               |
| Deploy is live but clients stay on the old version, no "Update available" | `/sw.js` was served from Cloudflare's cache (`cf-cache-status: HIT`). The `sw-no-cache` Middleware in `ingress.yaml` prevents it; purge the URL once (see below). |

### A stale service worker after a deploy

The browser's service-worker update check bypasses its own HTTP cache but not
Cloudflare's. `ingress.yaml` therefore answers `/sw.js` with `Cache-Control:
no-cache, must-revalidate`, which Cloudflare honours by not caching the file at
all (#21). If a copy is already cached (`curl -sI https://amv.lefted.dev/sw.js`
shows `cf-cache-status: HIT` and an old `etag`), evict it once in the
dashboard: **Caching → Configuration → Custom Purge → URL**
`https://amv.lefted.dev/sw.js`. Clients pick up the new worker on their next
visit and show the "Update available" toast.
