# All development tasks run inside Docker (see compose.yaml / Dockerfile.dev).
# The host only needs docker, make and git.

# Container user: with rootless Docker/Podman, container root *is* the host user;
# with rootful Docker run as the host UID:GID. Either way files stay owned by you.
ifneq ($(shell docker info --format '{{.SecurityOptions}}' 2>/dev/null | grep -c rootless),0)
export DEV_USER := 0:0
else
export DEV_USER := $(shell id -u):$(shell id -g)
endif

VUE_VERSION ?= 3.5
VERSION ?= dev-$(shell date +%s)
RUN := docker compose run --rm dev

.PHONY: help image test serve preview up down vendor icons site shell clean

help: ## Show available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  make %-9s %s\n", $$1, $$2}'

image: ## Build the dev container image
	docker compose build dev

test: ## Run unit tests (node --test) in the container
	$(RUN) node --test "tests/**/*.test.js"

serve: ## Serve the repo on http://localhost:8000 (dev mode, no SW caching)
	docker compose up serve

preview: site ## Build _site with a version stamp and serve it (tests the update flow)
	SERVE_ROOT=_site docker compose up serve

up: ## Start the dev server in the background
	docker compose up -d serve

down: ## Stop background containers
	docker compose down

vendor: ## Vendor the latest Vue $(VUE_VERSION).x ESM browser build into vendor/
	$(RUN) sh tools/vendor-vue.sh $(VUE_VERSION)

icons: ## Render assets/icons PNGs from the SVG sources
	$(RUN) sh tools/icons.sh

site: ## Assemble the deployable _site/ (VERSION=... to stamp)
	$(RUN) sh tools/build-site.sh $(VERSION)

shell: ## Open a shell in the dev container
	docker compose run --rm dev sh

clean: ## Remove build output
	rm -rf _site
