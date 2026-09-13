PORT ?= 8000

.PHONY: serve test lint sync-17lands

serve:
	python3 -m http.server $(PORT)

test:
	npm test

lint:
	npm run lint

# Sync 17Lands data to Firestore for given set(s)
# Usage: make sync-17lands SET=hob       # single set
#        make sync-17lands SET=hob,fin   # multiple sets
sync-17lands:
ifndef SET
	@echo "Usage: make sync-17lands SET=<code>  (e.g. make sync-17lands SET=hob)"
	@exit 1
endif
	node scripts/sync-17lands.mjs $(SET)
