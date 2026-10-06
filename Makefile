.PHONY: up down

ROOT := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
PY := $(ROOT)/backend/.venv/bin/python
PIP := $(ROOT)/backend/.venv/bin/pip
PGBIN := /usr/lib/postgresql/18/bin
PGDATA := $(ROOT)/.pgdata
PGPORT := 5435

up:
	@test -f $(ROOT)/.env || cp $(ROOT)/.env.example $(ROOT)/.env
	@test -x $(PY) || python3 -m venv $(ROOT)/backend/.venv
	@$(PIP) install -q -r $(ROOT)/backend/requirements.txt
	@cd $(ROOT)/frontend && npm install
	@set -eu; \
	if [ ! -d $(PGDATA)/base ]; then \
		$(PGBIN)/initdb -D $(PGDATA) --username="$$(id -un)" --auth-local=peer --auth-host=scram-sha-256 >/dev/null; \
	fi; \
	if ! $(PGBIN)/pg_isready -h $(PGDATA) -p $(PGPORT) >/dev/null 2>&1; then \
		$(PGBIN)/pg_ctl -D $(PGDATA) -l $(PGDATA)/server.log -o "-p $(PGPORT) -k $(PGDATA)" start >/dev/null; \
	fi; \
	$(PGBIN)/psql -h $(PGDATA) -p $(PGPORT) -d postgres -v ON_ERROR_STOP=1 -c "DO \$$\$$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'device') THEN CREATE ROLE device LOGIN PASSWORD 'device' CREATEDB; END IF; END \$$\$$;"; \
	$(PGBIN)/psql -h $(PGDATA) -p $(PGPORT) -d postgres -tc "SELECT 1 FROM pg_database WHERE datname = 'device_management'" | grep -q 1 \
		|| $(PGBIN)/psql -h $(PGDATA) -p $(PGPORT) -d postgres -c "CREATE DATABASE device_management OWNER device;"; \
	set -a; \
	while IFS= read -r line || [ -n "$$line" ]; do \
		case "$$line" in ''|\#*) continue ;; esac; \
		export "$$line"; \
	done < $(ROOT)/.env; \
	set +a; \
	export POSTGRES_HOST=127.0.0.1 POSTGRES_PORT=$(PGPORT) POSTGRES_USER=device POSTGRES_PASSWORD=device POSTGRES_DB=device_management; \
	cd $(ROOT)/backend; \
	$(PY) manage.py migrate --noinput; \
	$(PY) manage.py seed; \
	$(PY) manage.py runserver 127.0.0.1:8484 & api=$$!; \
	web=""; \
	if ss -ltn | grep -q ':3434 '; then \
		echo "Web app already running at http://localhost:3434"; \
	else \
		cd $(ROOT)/frontend; \
		API_URL=http://127.0.0.1:8484 npm run dev & web=$$!; \
	fi; \
	trap 'kill $$api $$web 2>/dev/null; wait $$api $$web 2>/dev/null; $(PGBIN)/pg_ctl -D $(PGDATA) -m fast stop >/dev/null' INT TERM EXIT; \
	wait $$api $$web

down:
	@fuser -k 3434/tcp 8484/tcp >/dev/null 2>&1 || true
	@if [ -d $(PGDATA)/base ] && $(PGBIN)/pg_isready -h $(PGDATA) -p $(PGPORT) >/dev/null 2>&1; then \
		$(PGBIN)/pg_ctl -D $(PGDATA) -m fast stop >/dev/null; \
	fi
	@echo "Stopped web app, API, and local database."
