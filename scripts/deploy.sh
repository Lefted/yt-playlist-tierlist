#!/usr/bin/env bash
#
# deploy.sh — build & deploy the app image safely.
#
# Implements the model in docs/deploy/deploys.md: tag the image by git short
# SHA (never :latest), build only from a clean+pushed tree, pin the SHA
# declaratively in deploy/k8s/app.yaml, and verify the rollout over the app's
# own /healthz and /api/v1/meta endpoints (no `kubectl exec … psql`).
#
# Flow: guard → preflight (curl /api/v1/meta) → build+push → rewrite image:
# line → kubectl apply → rollout status → verify (curl) → commit the bump (only
# after it's live & healthy; never pushes — prints `git push` for you).
#
# Run from anywhere inside the repo, on a clean `main`, with the registry SSH
# tunnel up (see docs/deploy/runbook.md). Needs git, curl, podman, kubectl on
# PATH; jq is used when present, else a grep fallback parses /api/v1/meta.
#
# Usage: scripts/deploy.sh [options]   (see --help)

set -euo pipefail

# ---- defaults ---------------------------------------------------------------
HOST="https://amv.lefted.dev"
NS="amv"
DEPLOYMENT="amv-tierlist"
SELECTOR="app=amv-tierlist"
IMAGE="localhost:5000/amv-tierlist"
MANIFEST="deploy/k8s/app.yaml"
MIGRATIONS_DIR="drizzle"
BUILD_CONTEXT="."

recreate=0
dryrun=0
no_commit=0
bootstrap_opt=0

die()  { printf 'error: %s\n' "$1" >&2; exit 1; }
warn() { printf 'warning: %s\n' "$1" >&2; }
info() { printf '%s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

usage() {
  cat <<'EOF'
deploy.sh — build & deploy the app image safely.

Usage: scripts/deploy.sh [options]

Options:
      --recreate        For a deploy carrying a DESTRUCTIVE migration: scale to 0
                        first so no old pod is alive when the new schema lands
                        (brief downtime, no overlap). Default: RollingUpdate.
      --bootstrap       First deploy only: skip the preflight against the live
                        app. Use it when nothing is serving the host yet.
      --dry-run         Print the plan (SHA, preflight, the commands) and stop —
                        no build, push, apply, or commit.
      --host <url>      Host for the /healthz + /api/v1/meta checks.
                        Default: https://amv.lefted.dev
      --namespace <ns>  Kubernetes namespace. Default: amv
      --image <ref>     Image repo (without tag). Default: localhost:5000/amv-tierlist
      --no-commit       Apply + verify but don't commit the image: bump (leave it
                        for you to stage). Default: commit after healthy.
  -h, --help            Show this help.

It never pushes git — it prints the `git push` to run after you review.
EOF
}

# ---- args -------------------------------------------------------------------
while [[ $# -gt 0 ]]; do
  case "$1" in
    --recreate)    recreate=1; shift ;;
    --bootstrap)   bootstrap_opt=1; shift ;;
    --dry-run)     dryrun=1; shift ;;
    --host)        HOST="${2:-}"; [[ -n $HOST ]] || die "--host needs a value"; shift 2 ;;
    --host=*)      HOST="${1#*=}"; shift ;;
    --namespace)   NS="${2:-}"; [[ -n $NS ]] || die "--namespace needs a value"; shift 2 ;;
    --namespace=*) NS="${1#*=}"; shift ;;
    --image)       IMAGE="${2:-}"; [[ -n $IMAGE ]] || die "--image needs a value"; shift 2 ;;
    --image=*)     IMAGE="${1#*=}"; shift ;;
    --no-commit)   no_commit=1; shift ;;
    -h|--help)     usage; exit 0 ;;
    *)             die "unknown option: $1 (see --help)" ;;
  esac
done

HOST="${HOST%/}"

# MSYS (Git-Bash on Windows) rewrites colon-bearing args like the image ref and
# 'app=amv-tierlist' into Windows paths before podman/kubectl see them. Wrap the
# affected calls; both vars are no-ops off Windows.
pman() { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' podman "$@"; }
kc()   { MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*' kubectl "$@"; }

# json_int_field <blob> <field> -> integer value or nothing.
json_int_field() {
  local blob=$1 field=$2
  if have jq; then printf '%s' "$blob" | jq -er ".${field} // empty" 2>/dev/null || true
  else printf '%s' "$blob" | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*[0-9]+" | grep -oE '[0-9]+' | head -1; fi
}
# json_str_field <blob> <field> -> string value or nothing.
json_str_field() {
  local blob=$1 field=$2
  if have jq; then printf '%s' "$blob" | jq -er ".${field} // empty" 2>/dev/null || true
  else printf '%s' "$blob" | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" | sed -E 's/.*:[[:space:]]*"([^"]*)"/\1/' | head -1; fi
}

# ---- 1. preflight: tools, repo, clean+pushed tree ---------------------------
have git || die "git not found on PATH"
REPO=$(git rev-parse --show-toplevel) || die "not inside a git repository"
cd "$REPO"

need=(git curl)
(( dryrun )) || need+=(podman kubectl)
missing=()
for t in "${need[@]}"; do have "$t" || missing+=("$t"); done
[[ ${#missing[@]} -eq 0 ]] || die "missing required tools on PATH: ${missing[*]}"

[[ -f $MANIFEST ]] || die "manifest not found: $MANIFEST"
[[ -f Dockerfile ]] || die "Dockerfile not found at the repo root — the image build needs it."

branch=$(git rev-parse --abbrev-ref HEAD)
clean=1; git diff --quiet && git diff --cached --quiet || clean=0
SHA=$(git rev-parse --short HEAD)

# HEAD must be pushed, so the image tag maps to a fetchable commit.
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)
ahead=""
[[ -n $upstream ]] && ahead=$(git rev-list "@{u}..HEAD" --count 2>/dev/null || echo "?")

if (( dryrun )); then
  [[ $branch == main ]] || warn "not on main (on '$branch') — dry run continues."
  (( clean )) || warn "working tree is not clean — dry run continues."
  [[ -n $upstream ]] || warn "HEAD has no upstream — dry run continues."
  [[ ${ahead:-0} == 0 ]] || warn "HEAD is $ahead commit(s) ahead of $upstream (unpushed) — dry run continues."
else
  [[ $branch == main ]] || die "must be on main to deploy (on '$branch')."
  (( clean )) || die "working tree is not clean — commit or stash first (the deploy commits the image: bump itself)."
  [[ -n $upstream ]] || die "HEAD has no upstream branch — push it so the image tag maps to a fetchable commit."
  [[ ${ahead:-0} == 0 ]] || die "HEAD is $ahead commit(s) ahead of $upstream — push first (the image tag must map to a pushed commit)."
fi

# ---- 2. resolve the image's embedded migration version ----------------------
# Drizzle numbers its files 0000_*.sql, 0001_*.sql, … and applies them in that
# order, one row per file in __drizzle_migrations. So the COUNT of .sql files is
# the schema version this image carries — the same number the app reports as
# binarySchemaVersion — and file 0000 means version 1.
migrations=()
if [[ -d $MIGRATIONS_DIR ]]; then
  while IFS= read -r f; do migrations+=("$f"); done \
    < <(find "$MIGRATIONS_DIR" -maxdepth 1 -name '*.sql' | sort)
fi
imgMax=${#migrations[@]}
if (( imgMax == 0 )); then
  if (( dryrun )); then
    warn "no *.sql migrations in $MIGRATIONS_DIR — dry run continues."
  else
    die "found no *.sql migrations in $MIGRATIONS_DIR — the image would boot with no schema."
  fi
fi

# ---- 3. preflight against the live app (curl /api/v1/meta) ------------------
liveDb=""
if (( bootstrap_opt )); then
  warn "--bootstrap: skipping the preflight against $HOST (nothing is expected to be serving it yet)."
else
  mtmp=$(mktemp)
  httpCode=$(curl -sS -m 15 -o "$mtmp" -w '%{http_code}' "$HOST/api/v1/meta" 2>/dev/null || echo "000")
  metaBody=$(cat "$mtmp"); rm -f "$mtmp"

  case "$httpCode" in
    200)
      liveDb=$(json_int_field "$metaBody" dbSchemaVersion)
      [[ -n $liveDb ]] || die "could not parse dbSchemaVersion from $HOST/api/v1/meta:
$metaBody"
      ;;
    404|502|503)
      # Either the ingress routes nowhere yet or the deployed build predates
      # /api/v1/meta. Either way there is no schema version to compare against,
      # so liveDb stays empty and the gates below become no-ops.
      warn "HTTP $httpCode from $HOST/api/v1/meta — nothing usable is live there. Skipping the image-behind-DB preflight."
      ;;
    000) die "could not reach $HOST/api/v1/meta — is the app up and --host correct? For the very first deploy, pass --bootstrap." ;;
    *)   die "unexpected HTTP $httpCode from $HOST/api/v1/meta (pass --bootstrap if this is the first deploy):
$metaBody" ;;
  esac
fi

# Refuse an image whose schema is behind the live DB. Migrations are
# forward-only in prod: such an image would run against a schema it does not
# understand. Roll FORWARD to a fixed commit instead.
if [[ -n $liveDb ]] && (( imgMax < liveDb )); then
  die "this image (commit $SHA) carries $imgMax migration(s), but the live DB is at version $liveDb — it is BEHIND the schema. Deploy a commit whose migration count is >= $liveDb."
fi

# Warn on a destructive migration this deploy INTRODUCES (the files past the
# live DB version), unless --recreate removes the overlap that makes them risky.
# Only meaningful when the live version is known. Matches real destructive ops
# only — not "DROP NOT NULL"/"DROP DEFAULT", which merely relax a constraint.
destructive=""
if [[ -n $liveDb ]] && (( ! recreate )); then
  for (( i = liveDb; i < imgMax; i++ )); do
    f=${migrations[$i]}
    if grep -iqE 'DROP[[:space:]]+(TABLE|COLUMN|CONSTRAINT|INDEX|TYPE|SCHEMA|VIEW)|RENAME|TRUNCATE|ALTER[[:space:]]+COLUMN[^;]*TYPE' "$f"; then
      destructive+="${destructive:+, }${f##*/}"
    fi
  done
fi
[[ -z $destructive ]] || warn "new migration(s) look destructive ($destructive) — the brief old-pod/new-schema overlap could error. Consider --recreate."

# ---- dry-run: print the plan and stop --------------------------------------
BUILD_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)
if (( dryrun )); then
  cat <<EOF

── dry run — nothing was changed ───────────────────────────────────
  host                  : $HOST
  namespace             : $NS
  commit (image tag)    : $SHA
  image                 : $IMAGE:$SHA
  image migration count : $imgMax
  live DB schema version: $([[ -n $liveDb ]] && echo "$liveDb" || echo "<unknown — nothing live (bootstrap)>")
  strategy              : $([[ $recreate == 1 ]] && echo 'Recreate (scale to 0 first)' || echo 'RollingUpdate (zero-downtime)')
  destructive migrations: ${destructive:-<none detected>}

commands that would run (real deploy):
  podman build --network=host --build-arg GIT_SHA=$SHA --build-arg BUILD_TIME=$BUILD_TIME -t $IMAGE:$SHA $BUILD_CONTEXT
  podman push $IMAGE:$SHA
  # rewrite the app 'image:' line in $MANIFEST -> $IMAGE:$SHA
$([[ $recreate == 1 ]] && echo "  kubectl -n $NS scale deployment/$DEPLOYMENT --replicas=0   # wait until 0 pods")
  kubectl -n $NS apply -f $MANIFEST
  kubectl -n $NS rollout status deployment/$DEPLOYMENT --timeout=180s
  # verify: GET $HOST/healthz is 200, and /api/v1/meta has commit==$SHA
  #         and dbSchemaVersion==binarySchemaVersion, then:
  git add $MANIFEST && git commit -m "Deploy $SHA"
  # finally (you run this): git push
────────────────────────────────────────────────────────────────────
EOF
  exit 0
fi

# ---- 4. build + push --------------------------------------------------------
# --network=host because podman's default bridge makes many-small-connection
# fetches (npm ci) crawl on this WSL2 setup — they look hung rather than failing.
info "Building $IMAGE:$SHA (commit $SHA)…"
pman build --network=host --build-arg GIT_SHA="$SHA" --build-arg BUILD_TIME="$BUILD_TIME" -t "$IMAGE:$SHA" "$BUILD_CONTEXT" \
  || die "podman build failed."
info "Pushing $IMAGE:$SHA…"
pman push "$IMAGE:$SHA" || die "podman push failed — is the registry SSH tunnel up? (see docs/deploy/runbook.md)"

# ---- 5. pin the SHA in the manifest -----------------------------------------
# Rewrite the app 'image:' line — identified as the one whose ref contains a '/'
# (a registry/repo). Uses '|' as the sed delimiter so the '/' and ':' in the ref
# aren't special, and the raw ref is safe in the replacement (no '&'/'\'/'|' in
# a container image ref).
[[ $IMAGE =~ ^[A-Za-z0-9._:/-]+$ ]] || die "refusing to deploy: --image '$IMAGE' has characters that would break the manifest rewrite."
before=$(grep -cE '^[[:space:]]*image:[[:space:]]*[^[:space:]]*/' "$MANIFEST" || true)
[[ ${before:-0} == 1 ]] || die "expected exactly one registry-qualified image: line in $MANIFEST, found ${before:-0}"
sed -i -E "s|^([[:space:]]*image:[[:space:]]*)[^[:space:]]*/[^[:space:]]*|\\1${IMAGE}:${SHA}|" "$MANIFEST"
info "Pinned $MANIFEST -> $IMAGE:$SHA"

# ---- 6. apply (Recreate path scales to 0 first) -----------------------------
if (( recreate )); then
  info "Recreate: scaling $DEPLOYMENT to 0 so no old pod meets the new schema…"
  kc -n "$NS" scale deployment/"$DEPLOYMENT" --replicas=0
  for _ in $(seq 1 60); do
    n=$(kc -n "$NS" get pods -l "$SELECTOR" -o name 2>/dev/null | grep -c . || true)
    [[ "${n:-0}" == "0" ]] && break
    sleep 2
  done
fi
info "Applying $MANIFEST…"
kc -n "$NS" apply -f "$MANIFEST"
info "Waiting for rollout…"
kc -n "$NS" rollout status deployment/"$DEPLOYMENT" --timeout=180s || die "rollout did not complete — the image: bump is left uncommitted. Inspect: kubectl -n $NS get pods -l $SELECTOR"

# ---- 7. verify over /healthz and /api/v1/meta -------------------------------
info "Verifying /healthz…"
healthCode=$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$HOST/healthz" 2>/dev/null || echo "000")
[[ $healthCode == "200" ]] || die "verify: GET $HOST/healthz returned $healthCode, expected 200."

info "Verifying /api/v1/meta…"
latest=$(curl -sS -m 15 "$HOST/api/v1/meta") || die "verify: could not reach $HOST/api/v1/meta after rollout."
gotCommit=$(json_str_field "$latest" commit)
gotDb=$(json_int_field "$latest" dbSchemaVersion)
gotBin=$(json_int_field "$latest" binarySchemaVersion)
[[ $gotCommit == "$SHA" ]] || die "verify: /api/v1/meta commit=$gotCommit, expected $SHA (rollout may not have swapped, or an old pod answered)."
[[ -n $gotDb && -n $gotBin && $gotDb == "$gotBin" ]] \
  || die "verify: schema out of sync — dbSchemaVersion=$gotDb binarySchemaVersion=$gotBin."
info "Live: commit $gotCommit · schema $gotDb (binary $gotBin)."

# ---- 8. commit the bump (only now it's live & healthy; never push) ----------
if (( no_commit )); then
  info "Skipping commit (--no-commit). The $MANIFEST image: bump is uncommitted."
elif git diff --quiet -- "$MANIFEST"; then
  info "No manifest change to commit (image was already $SHA)."
else
  git add -- "$MANIFEST"
  git commit -m "Deploy $SHA"
  info "Committed the image: bump locally (not pushed)."
fi

cat <<EOF

✓ Deployed $IMAGE:$SHA
    commit $SHA · schema $gotDb · namespace $NS

$( (( no_commit )) && echo "Stage & commit $MANIFEST when ready." || echo "Commit was created locally but NOT pushed. To publish it:
    git push" )
EOF
