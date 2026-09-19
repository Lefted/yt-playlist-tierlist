# Deploys (image identity, migrations, rollout)

How the app image is built, tagged, deployed, verified and rolled back on the
single-node k3s VPS. The step-by-step bring-up of the cluster lives in
[`runbook.md`](runbook.md); this document is the durable contract — what a
deploy guarantees and why.

## The model in one paragraph

The image is tagged by **git short SHA** (never `:latest`), built only from a
**clean, pushed** tree, and named **explicitly in
[`deploy/k8s/app.yaml`](../../deploy/k8s/app.yaml)**, which is committed and
applied with `kubectl apply`. A run that dies after pushing the image cannot
leave a mismatch, because the manifest names the exact SHA. Migrations run **on
boot** under a Postgres advisory lock. The app reports its own identity at
**`GET /api/v1/meta`**, so [`scripts/deploy.sh`](../../scripts/deploy.sh)
preflights and verifies over `curl` rather than `kubectl exec … psql`.

## Decisions & rationale

### 1. Immutable git-SHA tags, never `:latest`

Images are `localhost:5000/amv-tierlist:<short-sha>`, where `<short-sha>` is
`git rev-parse --short HEAD`.

The deploy refuses a dirty or unpushed `HEAD`, so every tag maps to a real,
fetchable commit and "deploy a stale build" stops being possible by accident. A
single mutable tag is shared state that any machine can clobber — CoSpace has an
incident where exactly that wedged a rollout. A timestamp tag would say _when_
an image was built but not _what is in it_; a SHA round-trips to source
(`git show <sha>`).

`imagePullPolicy: IfNotPresent` follows from immutability: a SHA tag never needs
re-pulling, so `Always` is pure downside.

### 2. Declarative — the SHA lives in `app.yaml`

The running image is whatever `app.yaml` says. Git is both the source of truth
and the deploy history.

Not `kubectl set image`: then the manifest holds a placeholder and drifts from
reality, and **any** later `kubectl apply` — to add an env var, to change a
probe — silently reverts the image to that placeholder. Naming the exact SHA
disarms that.

### 3. Migrate-on-boot; behind-the-DB is refused before the build

Migrations run on boot, under a Postgres advisory lock, so the two replicas do
not race: one migrates, the other waits and no-ops. There is no separate
migration `Job` or `initContainer` — at this scale it would run per pod and buy
nothing.

**Migrations are forward-only in production.** To recover from a bad deploy you
roll _forward_ to a fixed image. `scripts/deploy.sh` compares the number of
`drizzle/*.sql` files in the working tree against the live `dbSchemaVersion` and
refuses to build an image that carries fewer — that image would run against a
schema it does not understand. Drizzle numbers its files from `0000`, applies
them in order and records one row per file, so the file _count_ is the schema
version, and `0000_init.sql` alone means version 1.

### 4. RollingUpdate by default, `--recreate` for destructive migrations

`replicas: 2`, `maxSurge: 1`, `maxUnavailable: 0`. A new pod must go **Ready**
before any old pod is removed, which buys two things: zero downtime, and an
image that crashes on boot never takes over — the old pods keep serving and the
rollout stalls instead.

The few seconds of overlap mean the **old code briefly talks to the
already-migrated database**. For an _additive_ migration (new table, column,
index) that is always safe. For a _destructive_ one the old code can error in
that window, so deploy it with **`--recreate`**: all old pods stop, then the new
one starts and migrates (no overlap, ~10 s of downtime). The script greps the
migrations this deploy introduces for `DROP` / `RENAME` / `TRUNCATE` /
`ALTER COLUMN … TYPE` and warns if it looks destructive and you did not pass the
flag.

### 5. `/healthz` and `/api/v1/meta` are separate on purpose

`GET /healthz` is **DB-free** and cheap: it is what the readiness and liveness
probes hit every few seconds, and it must not go red because Postgres is busy.

`GET /api/v1/meta` opens a database connection and returns:

```json
{
	"commit": "1a2b3c4",
	"buildTime": "2026-09-19T…",
	"startedAt": "2026-09-19T…",
	"dbSchemaVersion": 3,
	"binarySchemaVersion": 3
}
```

`commit` and `buildTime` come from the `GIT_SHA` / `BUILD_TIME` build args that
the deploy script passes and the Dockerfile threads through. That split is also
why `/api/v1/meta` — not `/healthz` — is the endpoint that proves a credential
rotation landed: `/healthz` would stay green with a broken `DATABASE_URL`.

### 6. Verify, then commit

`scripts/deploy.sh` commits the one-line `image:` bump **only after** the
rollout is complete and both endpoints check out, and it **never pushes** — it
prints the `git push` for you to run after a look. If the rollout stalls, the
bump is left uncommitted, so the repo keeps naming the image that is actually
serving.

## The loop

```sh
ssh -N -L 5000:localhost:5000 hygames.eu   # in its own terminal, keep it open

bash scripts/deploy.sh --dry-run    # print the plan and stop
bash scripts/deploy.sh              # normal deploy (RollingUpdate)
bash scripts/deploy.sh --recreate   # deploy carrying a destructive migration
bash scripts/deploy.sh --bootstrap  # the very first deploy, nothing live yet
```

The script uses the **current** `kubectl` context (`hygames`) and needs `git`,
`curl`, `podman` and `kubectl` on `PATH`; `jq` is used when present.

## Rollback

Deploy an older SHA whose migration count is `>=` the live `dbSchemaVersion` —
the §3 preflight enforces that and refuses anything behind the schema. Going
genuinely behind the schema means down-migrating the database first, which is a
manual, deliberate operation and not part of this loop.

For an emergency that cannot wait for a build, `kubectl -n amv rollout undo
deployment/amv-tierlist` puts the previous ReplicaSet back in seconds — but it
leaves `app.yaml` naming an image that is no longer running, so re-pin the
previous SHA in the manifest and commit it as soon as the fire is out.
